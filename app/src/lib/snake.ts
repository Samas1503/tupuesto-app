import { db } from '../db'
import { syncPush } from './sync'

/** camelCase (Dexie) → snake_case (Neon) — mapa inverso del MAP de lib/sync.ts */
const MAP_INV: Record<string, string> = {
  duenioId: 'duenio_id', vendedorId: 'vendedor_id', puestoId: 'puesto_id',
  jornadaId: 'jornada_id', solicitadoPor: 'solicitado_por', fondoCaja: 'fondo_caja',
  horaFin: 'hora_fin', cierreAnticipadoOk: 'cierre_anticipado_ok',
  confirmadaAt: 'confirmada_at', createdAt: 'created_at', resueltaAt: 'resuelta_at',
  precioCosto: 'precio_costo', metodoPago: 'metodo_pago', stockDia: 'stock_dia',
  debeCambiarPin: 'debe_cambiar_pin', saldoInicial: 'saldo_inicial',
  pinHash: 'pin_hash', plan: 'plan',
}

/** convierte las keys de primer nivel de una fila Dexie a snake_case (Neon).
 *  Los JSONB anidados (items, despacho, cierre…) quedan igual: el api los serializa. */
export function toSnake<T extends object>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [MAP_INV[k] ?? k, v]))
}

/** tablas espejadas en Neon (whitelist del api /api/sync) */
export type TablaSync =
  | 'usuarios' | 'puestos' | 'productos'
  | 'jornadas' | 'ventas' | 'solicitudes'

/** relee la fila de Dexie y la empuja a Neon (upsert por id).
 *  Fire-and-forget: nunca rechaza ni bloquea la UI — si no hay red queda local. */
/** sesión demo (email @demo.tupuesto): no persiste a Neon — solo IndexedDB local */
async function esDemo(): Promise<boolean> {
  const id = Number(localStorage.getItem('tp-user-id'))
  if (!id) return false
  const u = await db.usuarios.get(id)
  return u?.email?.endsWith('@demo.tupuesto') ?? false
}

export async function pushRow(tabla: TablaSync, id: number) {
  try {
    if (await esDemo()) return // demo: los cambios no suben a Neon
    const row = await db[tabla].get(id)
    if (row) syncPush(tabla, [toSnake(row)]).catch(() => {})
  } catch { /* error local — queda para el próximo sync */ }
}
