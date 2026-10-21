import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Jornada, Solicitud, Venta } from '../types'

export function useDatos() {
  const productos = useLiveQuery(() => db.productos.orderBy('orden').toArray(), [])
  const puestos = useLiveQuery(() => db.puestos.orderBy('id').toArray(), [])
  const vendedores = useLiveQuery(() => db.vendedores.orderBy('id').toArray(), [])
  return {
    productos: productos ?? [],
    puestos: puestos ?? [],
    vendedores: vendedores ?? [],
    cargando: !productos || !puestos || !vendedores,
  }
}

export function useJornadasDe(fecha: string): Jornada[] {
  return useLiveQuery(() => db.jornadas.where('fecha').equals(fecha).sortBy('puestoId'), [fecha]) ?? []
}

export function useJornadasRango(desde: string, hasta: string): Jornada[] {
  return (
    useLiveQuery(
      () => db.jornadas.where('fecha').between(desde, hasta, true, true).sortBy('fecha'),
      [desde, hasta],
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
  return useLiveQuery(() => db.solicitudes.where('estado').equals('pendiente').toArray(), []) ?? []
}

export function useJornadasLibres(fecha: string): Jornada[] {
  return useLiveQuery(
    () => db.jornadas.where('fecha').equals(fecha).filter(j => j.vendedorId == null).toArray(),
    [fecha],
  ) ?? []
}
