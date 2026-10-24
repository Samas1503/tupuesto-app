import { db } from '../db'

/** base del api — en prod landing sirve /api desde tupuesto.vercel.app */
const API = location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://tupuesto.vercel.app'

/** snake_case (Neon) → camelCase (Dexie) */
const MAP: Record<string, string> = {
  duenio_id: 'duenioId', vendedor_id: 'vendedorId', puesto_id: 'puestoId',
  jornada_id: 'jornadaId', solicitado_por: 'solicitadoPor', fondo_caja: 'fondoCaja',
  hora_fin: 'horaFin', cierre_anticipado_ok: 'cierreAnticipadoOk',
  confirmada_at: 'confirmadaAt', created_at: 'createdAt', resuelta_at: 'resueltaAt',
  precio_costo: 'precioCosto', metodo_pago: 'metodoPago',
  debe_cambiar_pin: 'debeCambiarPin', saldo_inicial: 'saldoInicial',
}
const camel = (r: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [MAP[k] ?? k, v]))

/** pull remoto → si una tabla local está vacía la llena con Neon */
export async function syncPull() {
  try {
    const res = await fetch(`${API}/api/sync`)
    if (!res.ok) return
    const data = await res.json()
    for (const [tabla, rows] of Object.entries(data) as [string, Record<string, unknown>[]][]) {
      const t = (db as Record<string, any>)[tabla]
      if (!t) continue
      if (await t.count() === 0 && rows.length) {
        await t.bulkAdd(rows.map(camel))
      }
    }
  } catch { /* sin red → queda local */ }
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
