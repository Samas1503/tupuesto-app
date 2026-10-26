import { avisarNuevasPendientes } from './notificar'
import { authHeader } from './auth'
import { db } from '../db'

/** base del api — en prod landing sirve /api desde tupuesto.vercel.app */
const API = location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://tupuesto.vercel.app'

/** snake_case (Neon) → camelCase (Dexie) */
const MAP: Record<string, string> = {
  duenio_id: 'duenioId', vendedor_id: 'vendedorId', puesto_id: 'puestoId',
  jornada_id: 'jornadaId', solicitado_por: 'solicitadoPor', fondo_caja: 'fondoCaja',
  hora_fin: 'horaFin', cierre_anticipado_ok: 'cierreAnticipadoOk',
  confirmada_at: 'confirmadaAt', created_at: 'createdAt', resuelta_at: 'resueltaAt',
  precio_costo: 'precioCosto', metodo_pago: 'metodoPago', stock_dia: 'stockDia',
  debe_cambiar_pin: 'debeCambiarPin', saldo_inicial: 'saldoInicial',
  pin_hash: 'pinHash', usuario_id: 'usuarioId', plan: 'plan',
}
// Postgres devuelve bigint como string — los timestamps de Dexie son number
const NUM = new Set(['createdAt', 'confirmadaAt', 'resueltaAt', 'fondoCaja', 'precio', 'precioCosto', 'total', 'cantidad',
  'id', 'duenioId', 'vendedorId', 'puestoId', 'jornadaId', 'solicitadoPor', 'stockDia', 'orden'])
const camel = (r: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => {
    const key = MAP[k] ?? k
    return [key, NUM.has(key) && typeof v === 'string' ? Number(v) : v]
  }))

/** pull remoto → merge real: upsert por id, la remota gana (last-write-wins) */
export async function syncPull() {
  // sesión demo (@demo.tupuesto): no pull — la demo vive 100% en IndexedDB local
  const sesionId = Number(localStorage.getItem('tp-user-id'))
  if (sesionId) {
    const u = await db.usuarios.get(sesionId)
    if (u?.email?.endsWith('@demo.tupuesto')) return
  }
  try {
    const res = await fetch(`${API}/api/sync`, { headers: { ...authHeader() } })
    if (!res.ok) { if (res.status === 401) localStorage.removeItem('tp-token'); return }
    const data = await res.json()
    for (const [tabla, rows] of Object.entries(data) as [string, Record<string, unknown>[]][]) {
      const t = (db as Record<string, any>)[tabla]
      if (!t) continue
      // remota es la fuente de verdad: borra lo local que ya no existe en Neon
      const ids = new Set(rows.map(r => Number(r.id)))
      const locales = await t.toCollection().primaryKeys()
      for (const id of locales) if (!ids.has(Number(id))) await t.delete(id)
      for (const row of rows) await t.put(camel(row))
    }
    // notificaciones nuevas de otros dispositivos → push del SO
    void avisarNuevasPendientes()
  } catch { /* sin red → queda local */ }
}

/** pull inicial + refresco periódico cada 30 s */
export function startSyncLoop() {
  void syncPull()
  setInterval(syncPull, 30_000)
}

/** push de una tabla hacia Neon (upsert por id) */
export async function syncPush(tabla: string, rows: unknown[]) {
  try {
    await fetch(`${API}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla, rows }),
    })
  } catch { /* sin red — queda para el próximo sync */ }
}
