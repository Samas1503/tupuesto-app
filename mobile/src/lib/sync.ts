import { avisarNuevasPendientes } from './notificar'
import { API, authHeader, borrarToken } from './auth'
import { bumpStore, replaceTabla, type Tabla } from './store'

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
      if (!Array.isArray(rows)) continue
      replaceTabla(tabla as Tabla, rows.map(camel))
    }
    bumpStore()
    // notificaciones nuevas de otros dispositivos → push local del SO
    void avisarNuevasPendientes()
  } catch { /* sin red → queda local */ }
}

let loopTimer: ReturnType<typeof setInterval> | null = null

/** pull inicial + refresco periódico cada 30 s — devuelve función de stop */
export function startSyncLoop(): () => void {
  void syncPull()
  if (loopTimer) clearInterval(loopTimer)
  loopTimer = setInterval(syncPull, 30_000)
  return () => {
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null }
  }
}

/** push de una tabla hacia Neon (upsert por id) */
export async function syncPush(tabla: string, rows: unknown[]) {
  try {
    const res = await fetch(`${API}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ tabla, rows }),
    })
    // token vencido/inválido → forzar re-login (igual que el pull)
    if (res.status === 401) { borrarToken(); onNoAutorizado?.() }
  } catch { /* sin red — queda para el próximo sync */ }
}
