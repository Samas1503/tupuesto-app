/** Cola de escrituras offline — tp-outbox en AsyncStorage.
 *  Toda mutación que no pudo pushear (sin red o error de transporte) queda
 *  acá en orden; al volver la conectividad (NetInfo) se drena FIFO a
 *  POST /api/sync y después se hace un syncPull para refrescar.
 *  La fila ya quedó aplicada al store local — la cola solo garantiza que
 *  llegue a Neon. */

import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo, { useNetInfo } from '@react-native-community/netinfo'
import { API, authHeader } from './auth'

const K_OUTBOX = 'tp-outbox'

export interface OutboxItem {
  tabla: string
  rows: unknown[]
}

let queue: OutboxItem[] = []
let hydrated = false
let draining = false

/* ── pub/sub para el badge ── */
let version = 0
const listeners = new Set<() => void>()
const bump = () => {
  version++
  listeners.forEach(l => l())
}
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const getVersion = () => version

export function useOutboxCount(): number {
  useSyncExternalStore(subscribe, getVersion)
  return queue.length
}

export { useNetInfo }

async function persist() {
  await AsyncStorage.setItem(K_OUTBOX, JSON.stringify(queue)).catch(() => {})
}

async function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await AsyncStorage.getItem(K_OUTBOX)
    if (raw) queue = JSON.parse(raw) as OutboxItem[]
  } catch { queue = [] }
  bump()
}

/** encola una escritura fallida — la fila ya está en el store local */
export async function encolar(tabla: string, rows: unknown[]) {
  await hydrate()
  queue.push({ tabla, rows })
  await persist()
  bump()
}

export const pendientes = () => queue.length

/** drena la cola FIFO contra /api/sync — se frena en el primer fallo
 *  (red o 4xx) para no perder el orden; lo que quedó sigue pendiente */
export async function drenarOutbox(): Promise<void> {
  await hydrate()
  if (draining || queue.length === 0) return
  draining = true
  try {
    while (queue.length > 0) {
      const item = queue[0]
      const res = await fetch(`${API}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ tabla: item.tabla, rows: item.rows }),
      })
      if (!res.ok) {
        if (res.status === 401) {
          // token muerto — no tiene sentido seguir; la cola espera al próximo login
          return
        }
        // 4xx/5xx de datos: descartar el item venenoso para no bloquear la cola
        if (res.status >= 400 && res.status < 500) {
          queue.shift()
          await persist()
          bump()
          continue
        }
        return // 5xx/red — reintenta en la próxima ventana de conectividad
      }
      queue.shift()
      await persist()
      bump()
    }
    // cola vacía → refrescar el estado remoto (los ids reales pueden diferir)
    const { syncPull } = await import('./sync')
    await syncPull()
  } catch {
    /* sin red — queda pendiente para el próximo evento */
  } finally {
    draining = false
  }
}

/** wiring: hidrata la cola y suscribe al cambio de conectividad.
 *  Devuelve el unsubscribe. Llamar una vez al montar la app con sesión. */
export function initOutbox(): () => void {
  void hydrate().then(() => bump())
  let fueOffline = false
  const unsub = NetInfo.addEventListener(state => {
    const online = state.isConnected !== false && state.isInternetReachable !== false
    if (!online) { fueOffline = true; return }
    if (fueOffline || queue.length > 0) {
      fueOffline = false
      void drenarOutbox()
    }
  })
  return unsub
}
