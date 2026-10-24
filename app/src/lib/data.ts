import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Jornada, Solicitud, Venta } from '../types'

/** dueño efectivo de la sesión para scoping de datos:
 *  duenio → su id · vendedor → su duenioId · admin → null (ve todo) */
export function scopeDuenio(usuarios?: { id?: number; rol?: string; duenioId?: number }[]): number | null {
  const rol = localStorage.getItem('tp-rol')
  const id = Number(localStorage.getItem('tp-user-id'))
  if (rol === 'duenio') return id
  if (rol === 'vendedor' && usuarios) return usuarios.find(u => u.id === id)?.duenioId ?? null
  return null
}

const deDuenio = <T extends { duenioId?: number }>(rows: T[], scope: number | null): T[] =>
  scope == null ? rows : rows.filter(r => r.duenioId == null || r.duenioId === scope)

export function useDatos() {
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [])
  const scope = scopeDuenio(usuarios ?? undefined)

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
const jornadaDeScope = (j: Jornada, scope: number | null, usuarios: { id?: number; duenioId?: number }[]): boolean => {
  if (scope == null) return true
  if (j.duenioId === scope) return true
  const v = usuarios.find(u => u.id === j.vendedorId)
  return v?.duenioId === scope || j.duenioId == null && v == null
}

export function useJornadasDe(fecha: string, usuarios: { id?: number; duenioId?: number }[] = []): Jornada[] {
  const scope = scopeDuenio(usuarios)
  return useLiveQuery(
    () => db.jornadas.where('fecha').equals(fecha).sortBy('puestoId')
      .then(js => js.filter(j => jornadaDeScope(j, scope, usuarios))),
    [fecha, scope],
  ) ?? []
}

export function useJornadasRango(desde: string, hasta: string, usuarios: { id?: number; duenioId?: number }[] = []): Jornada[] {
  const scope = scopeDuenio(usuarios)
  return (
    useLiveQuery(
      () => db.jornadas.where('fecha').between(desde, hasta, true, true).sortBy('fecha')
        .then(js => js.filter(j => jornadaDeScope(j, scope, usuarios))),
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

export function useSolicitudesPendientes(usuarios: { id?: number; duenioId?: number }[] = []): Solicitud[] {
  const scope = scopeDuenio(usuarios)
  return useLiveQuery(
    () => db.solicitudes.where('estado').equals('pendiente').toArray()
      .then(ss => scope == null ? ss : ss.filter(s => {
        const v = usuarios.find(u => u.id === s.vendedorId)
        return v?.duenioId === scope
      })),
    [scope],
  ) ?? []
}

export function useJornadasLibres(fecha: string, usuarios: { id?: number; duenioId?: number }[] = []): Jornada[] {
  const scope = scopeDuenio(usuarios)
  return useLiveQuery(
    () => db.jornadas.where('fecha').equals(fecha)
      .filter(j => j.vendedorId == null && jornadaDeScope(j, scope, usuarios)).toArray(),
    [fecha, scope],
  ) ?? []
}
