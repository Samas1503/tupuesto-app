import { byId } from './store'
import { syncPush } from './sync'

/** camelCase (store local) → snake_case (Neon) — mapa inverso del MAP de lib/sync.ts */
const MAP_INV: Record<string, string> = {
  duenioId: 'duenio_id', vendedorId: 'vendedor_id', puestoId: 'puesto_id',
  jornadaId: 'jornada_id', solicitadoPor: 'solicitado_por', fondoCaja: 'fondo_caja',
  horaFin: 'hora_fin', cierreAnticipadoOk: 'cierre_anticipado_ok',
  confirmadaAt: 'confirmada_at', createdAt: 'created_at', resueltaAt: 'resuelta_at',
  precioCosto: 'precio_costo', metodoPago: 'metodo_pago', stockDia: 'stock_dia',
  debeCambiarPin: 'debe_cambiar_pin', saldoInicial: 'saldo_inicial',
  pinHash: 'pin_hash', usuarioId: 'usuario_id', plan: 'plan',
}

/** convierte las keys de primer nivel de una fila a snake_case (Neon).
 *  Los JSONB anidados (items, despacho, cierre…) quedan igual: el api los serializa. */
export function toSnake<T extends object>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [MAP_INV[k] ?? k, v]))
}

/** tablas espejadas en Neon (whitelist del api /api/sync) */
export type TablaSync =
  | 'usuarios' | 'puestos' | 'productos'
  | 'jornadas' | 'ventas' | 'solicitudes' | 'notificaciones'

/** relee la fila del store y la empuja a Neon (upsert por id).
 *  Fire-and-forget: nunca rechaza ni bloquea la UI — si no hay red queda local. */
export async function pushRow(tabla: TablaSync, id: number) {
  try {
    const row = byId(tabla, id)
    if (row) syncPush(tabla, [toSnake(row)]).catch(() => {})
  } catch { /* error local — queda para el próximo sync */ }
}
