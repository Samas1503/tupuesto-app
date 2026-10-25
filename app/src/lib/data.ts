import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Jornada, Solicitud, Venta } from '../types'

/** dueño efectivo de la sesión para scoping de datos:
 *  duenio → su id · vendedor → su duenioId · admin → null (ve todo) */
export function scopeDuenio(): number | null {
  const rol = localStorage.getItem('tp-rol')
  const id = Number(localStorage.getItem('tp-user-id'))
  if (rol === 'duenio') return id
  if (rol === 'vendedor') return null // el vendedor no filtra — solo ve sus jornadas propias
  return null
}

const deDuenio = <T extends { duenioId?: number }>(rows: T[], scope: number | null): T[] =>
  scope == null ? rows : rows.filter(r => r.duenioId == null || r.duenioId === scope)

export function useDatos() {
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [])
  const scope = scopeDuenio()

  const productos = useLiveQuery(() => db.productos.orderBy('orden').toArray(), [])
  const puestos = useLiveQuery(() => db.puestos.orderBy('id').toArray(), [])
  const vendedores = useLiveQuery(
    () => db.usuarios.where('rol').equals('vendedor').sortBy('id'),
    [],
  )
  return {
    productos: deDuenio(productos ?? [], scope),
    puestos: deDuenio(puestos ?? [], scope),
    vendedores: vendedores == null ? [] : deDuenio(vendedores, scope),
    usuarios: usuarios ?? [],
    scope,
    cargando: !productos || !puestos || !vendedores || !usuarios,
  }
}

/** jornadas del dueño de sesión: por j.duenioId o por el vendedor (su duenioId) */
const jornadaDeScope = (
  j: Jornada,
  scope: number | null,
  usuarios: { id?: number; duenioId?: number }[],
  puestos: { id?: number; duenioId?: number }[] = [],
): boolean => {
  if (scope == null) return true
  if (j.duenioId === scope) return true
  const v = usuarios.find(u => u.id === j.vendedorId)
  if (v != null) return v.duenioId === scope
  // turno sin vendedor: solo es del dueño si el puesto es suyo o compartido
  const p = puestos.find(p => p.id === j.puestoId)
  return j.duenioId == null && (p == null || p.duenioId == null || p.duenioId === scope)
}

export function useJornadasDe(fecha: string): Jornada[] {
  const scope = scopeDuenio()
  return useLiveQuery(
    async () => {
      const [js, ps, us] = await Promise.all([
        db.jornadas.where('fecha').equals(fecha).sortBy('puestoId'),
        db.puestos.toArray(),
        db.usuarios.toArray(),
      ])
      return js.filter(j => jornadaDeScope(j, scope, us, ps))
    },
    [fecha, scope],
  ) ?? []
}

export function useJornadasRango(desde: string, hasta: string): Jornada[] {
  const scope = scopeDuenio()
  return (
    useLiveQuery(
      async () => {
        const [js, ps, us] = await Promise.all([
          db.jornadas.where('fecha').between(desde, hasta, true, true).sortBy('fecha'),
          db.puestos.toArray(),
          db.usuarios.toArray(),
        ])
        return js.filter(j => jornadaDeScope(j, scope, us, ps))
      },
      [desde, hasta, scope],
    ) ?? []
  )
}

export function useJornadaVendedor(vendedorId: number | null, fecha: string): Jornada | undefined {
  return useLiveQuery(
    async () => {
      if (vendedorId == null) return undefined
      // puede haber varias (turnos consecutivos) → la activa primero, si no la última
      const js = await db.jornadas.where('[fecha+vendedorId]').equals([fecha, vendedorId]).sortBy('createdAt')
      return js.find(j => j.estado !== 'confirmada') ?? js[js.length - 1]
    },
    [vendedorId, fecha],
  )
}

export function useVentasDe(jornadaId: number | undefined): Venta[] {
  return useLiveQuery(
    () => (jornadaId == null ? [] : db.ventas.where('jornadaId').equals(jornadaId).sortBy('createdAt')),
    [jornadaId],
  ) ?? []
}

export function useVentasDeJornadas(jornadaIds: number[]): Venta[] {
  return useLiveQuery(
    () => (jornadaIds.length === 0 ? [] : db.ventas.where('jornadaId').anyOf(jornadaIds).sortBy('createdAt')),
    [jornadaIds.join(',')],
  ) ?? []
}

export function useSolicitudesPendientes(): Solicitud[] {
  const scope = scopeDuenio()
  return useLiveQuery(
    async () => {
      const [ss, us] = await Promise.all([
        db.solicitudes.where('estado').equals('pendiente').toArray(),
        db.usuarios.toArray(),
      ])
      return scope == null ? ss : ss.filter(s => {
        const v = us.find(u => u.id === s.vendedorId)
        return v?.duenioId === scope
      })
    },
    [scope],
  ) ?? []
}

export function useJornadasLibres(fecha: string): Jornada[] {
  const scope = scopeDuenio()
  return useLiveQuery(
    async () => {
      const [js, ps, us] = await Promise.all([
        db.jornadas.where('fecha').equals(fecha).toArray(),
        db.puestos.toArray(),
        db.usuarios.toArray(),
      ])
      return js.filter(j => j.vendedorId == null && jornadaDeScope(j, scope, us, ps))
    },
    [fecha, scope],
  ) ?? []
}
