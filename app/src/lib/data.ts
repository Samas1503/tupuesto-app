import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { Jornada } from '../types'

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
    () =>
      vendedorId == null
        ? undefined
        : db.jornadas.where('[fecha+vendedorId]').equals([fecha, vendedorId]).first(),
    [vendedorId, fecha],
  )
}
