/** Store local — reemplazo de Dexie en React Native.
 *  Las 7 tablas viven en memoria como arrays; AsyncStorage es solo cache
 *  offline (write-through por tabla). La fuente de verdad es Neon vía
 *  syncPull/syncPush (last-write-wins por id, igual que en web).
 *
 *  Nota de ids: como en web (Dexie ++id), el id local nuevo es max(ids)+1.
 *  Es la misma semántica — con las mismas ventajas y limitaciones (dos
 *  dispositivos pueden generar el mismo id si ambos crean filas sin haber
 *  sincronizado; el push hace upsert por id). Paridad intencional. */

import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { decryptJson, encryptJson } from './crypto'
import type { Jornada, Notificacion, Producto, Puesto, Solicitud, Usuario, Venta } from '../types'

export interface PushToken {
  id?: number
  usuarioId: number
  token: string
  plataforma?: string
  createdAt: number
}

export type Tabla =
  | 'usuarios'
  | 'puestos'
  | 'productos'
  | 'jornadas'
  | 'ventas'
  | 'solicitudes'
  | 'notificaciones'
  | 'push_tokens'

export const TABLAS: Tabla[] = [
  'usuarios', 'puestos', 'productos', 'jornadas', 'ventas', 'solicitudes', 'notificaciones', 'push_tokens',
]

export interface Tablas {
  usuarios: Usuario[]
  puestos: Puesto[]
  productos: Producto[]
  jornadas: Jornada[]
  ventas: Venta[]
  solicitudes: Solicitud[]
  notificaciones: Notificacion[]
  push_tokens: PushToken[]
}

type Fila = { id?: number } & Record<string, unknown>

const data: Record<Tabla, Fila[]> = {
  usuarios: [], puestos: [], productos: [], jornadas: [],
  ventas: [], solicitudes: [], notificaciones: [], push_tokens: [],
}

/* ── pub/sub para React ── */
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

/** hook: re-render cuando el store cambia (pull, add, update…) */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, getVersion)
}

/* ── lectura ── */
export function all<T extends Tabla>(t: T): Tablas[T] {
  return data[t] as unknown as Tablas[T]
}

export function byId<T extends Tabla>(t: T, id: number): Tablas[T][number] | undefined {
  return data[t].find(r => r.id === id) as Tablas[T][number] | undefined
}

/* ── escritura ── */
const cacheKey = (t: Tabla) => `tp-cache-${t}`

function persist(t: Tabla) {
  void encryptJson(JSON.stringify(data[t]))
    .then(enc => AsyncStorage.setItem(cacheKey(t), enc))
    .catch(() => {})
}

/** inserta con id local = max(ids)+1 (paridad con Dexie ++id tras un pull) */
export function add<T extends Tabla>(t: T, row: Omit<Tablas[T][number], 'id'> & { id?: number }): number {
  const arr = data[t]
  const id = row.id ?? arr.reduce((m, r) => Math.max(m, r.id ?? 0), 0) + 1
  arr.push({ ...(row as object), id } as Fila)
  persist(t)
  bump()
  return id
}

export function update<T extends Tabla>(t: T, id: number, patch: Partial<Tablas[T][number]>) {
  const arr = data[t]
  const i = arr.findIndex(r => r.id === id)
  if (i < 0) return
  arr[i] = { ...arr[i], ...(patch as object) } as Fila
  persist(t)
  bump()
}

/** upsert por id (login offline: guarda el usuario con su pinHash local) */
export function put<T extends Tabla>(t: T, row: Tablas[T][number]) {
  const arr = data[t]
  const i = arr.findIndex(r => r.id === (row as { id?: number }).id)
  if (i >= 0) arr[i] = row as unknown as Fila
  else arr.push(row as unknown as Fila)
  persist(t)
  bump()
}

/** merge estilo syncPull: remota gana — upsert por id + borra lo que ya no viene */
export function replaceTabla(t: Tabla, rows: Fila[]) {
  const arr = data[t]
  const ids = new Set(rows.map(r => r.id))
  const byIds = new Map<number, Fila>()
  for (const r of arr) if (ids.has(r.id)) byIds.set(r.id!, r)
  for (const r of rows) byIds.set(r.id!, r)
  data[t] = [...byIds.values()]
  persist(t)
}

/** avisar a React tras un merge masivo (syncPull hace replaceTabla × N) */
export function bumpStore() {
  bump()
}

/** hidrata el cache de AsyncStorage al arrancar (antes del primer pull) */
export async function hydrateStore() {
  try {
    const pares = await AsyncStorage.multiGet(TABLAS.map(cacheKey))
    for (const [i, [, v]] of pares.entries()) {
      if (!v) continue
      try {
        const json = await decryptJson(v) // AES-GCM o JSON plano (v1)
        if (json == null) continue
        data[TABLAS[i]] = JSON.parse(json) as Fila[]
      } catch { /* cache corrupto — se ignora */ }
    }
    bump()
  } catch { /* sin cache — arranca vacío */ }
}

/** limpia todo el store (logout) */
export function clearStore() {
  for (const t of TABLAS) {
    data[t] = []
    void AsyncStorage.removeItem(cacheKey(t)).catch(() => {})
  }
  bump()
}
