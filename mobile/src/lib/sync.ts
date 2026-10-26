import { avisarNuevasPendientes } from './notificar'
import { API, authHeader, borrarToken } from './auth'
import { bumpStore, replaceTabla, TABLAS, type Tabla } from './store'
import { encolar } from './outbox'

/** snake_case (Neon) → camelCase (store local) — igual que lib/sync.ts de web */
const MAP: Record<string, string> = {
  duenio_id: 'duenioId', vendedor_id: 'vendedorId', puesto_id: 'puestoId',
  jornada_id: 'jornadaId', solicitado_por: 'solicitadoPor', fondo_caja: 'fondoCaja',
  hora_fin: 'horaFin', cierre_anticipado_ok: 'cierreAnticipadoOk',
  confirmada_at: 'confirmadaAt', created_at: 'createdAt', resuelta_at: 'resueltaAt',
  precio_costo: 'precioCosto', metodo_pago: 'metodoPago', stock_dia: 'stockDia',
  debe_cambiar_pin: 'debeCambiarPin', saldo_inicial: 'saldoInicial',
  pin_hash: 'pinHash', usuario_id: 'usuarioId', plan: 'plan',
}
// Postgres devuelve bigint como string — los timestamps del store son number
const NUM = new Set(['createdAt', 'confirmadaAt', 'resueltaAt', 'fondoCaja', 'precio', 'precioCosto', 'total', 'cantidad',
  'id', 'duenioId', 'vendedorId', 'puestoId', 'jornadaId', 'solicitadoPor', 'stockDia', 'orden'])
const camel = (r: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => {
    const key = MAP[k] ?? k
    return [key, NUM.has(key) && typeof v === 'string' ? Number(v) : v]
  }))

/** callback cuando el token vence (401) — App la setea para forzar logout */
let onNoAutorizado: (() => void) | null = null
export function setOnNoAutorizado(fn: (() => void) | null) {
  onNoAutorizado = fn
}

/** pull remoto → merge real: upsert por id, la remota gana (last-write-wins) */
export async function syncPull() {
  try {
    const res = await fetch(`${API}/api/sync`, { headers: { ...authHeader() } })
    if (!res.ok) {
      if (res.status === 401) { borrarToken(); onNoAutorizado?.() }
      return
    }
    const data = await res.json()
    for (const [tabla, rows] of Object.entries(data) as [string, Record<string, unknown>[]][]) {
      if (!Array.isArray(rows) || !TABLAS.includes(tabla as Tabla)) continue
      replaceTabla(tabla as Tabla, rows.map(camel))
    }
    bumpStore()
    // notificaciones nuevas de otros dispositivos → push local del SO
    void avisarNuevasPendientes()
  } catch { /* sin red → queda local */ }
}

let loopTimer: ReturnType<typeof setInterval> | null = null
let appSub: { remove: () => void } | null = null

/** pull inicial + al volver a foreground + cada 5 min — devuelve función de stop.
 *  En vez de polling de 30s: la app refresca cuando la abrís/volvés o cada 5 min si quedó abierta.
 *  El outbox drena al reconectar; el push de datos nuevos llega por expo-notifications. */
export function startSyncLoop(): () => void {
  void syncPull()
  if (loopTimer) clearInterval(loopTimer)
  // pull al volver a la app — reemplaza el polling frecuente (batería + requests)
  import('react-native').then(({ AppState }) => {
    appSub?.remove()
    appSub = AppState.addEventListener('change', st => { if (st === 'active') void syncPull() })
  }).catch(() => {})
  loopTimer = setInterval(syncPull, 5 * 60_000) // 5 min si queda abierta
  return () => {
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null }
    appSub?.remove(); appSub = null
  }
}

/** push de una tabla hacia Neon (upsert por id).
 *  Si falla la red → encola en el outbox (offline-first) en vez de perderse. */
export async function syncPush(tabla: string, rows: unknown[]) {
  try {
    const res = await fetch(`${API}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ tabla, rows }),
    })
    // token vencido/inválido → forzar re-login (igual que el pull)
    if (res.status === 401) { borrarToken(); onNoAutorizado?.(); return }
    // 5xx → reintentar vía outbox; 4xx de datos se descarta (el server la rechazó)
    if (!res.ok && res.status >= 500) await encolar(tabla, rows)
  } catch {
    // sin red — queda en la cola para cuando vuelva la conectividad
    await encolar(tabla, rows).catch(() => {})
  }
}
