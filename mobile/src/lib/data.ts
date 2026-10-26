/** Hooks de datos — port de lib/data.ts web (Dexie) al store en memoria.
 *  Mismos selectores y mismo scoping por dueño; en vez de useLiveQuery se usa
 *  useStoreVersion() (re-render ante cada cambio del store). */

import { useMemo } from 'react'
import { all, useStoreVersion } from './store'
import { sesionActual } from './auth'
import type { Jornada, Solicitud, Venta } from '../types'

/** dueño efectivo de la sesión para scoping de datos:
 *  duenio → su id · vendedor → null (no filtra, ve sus jornadas propias vía pull del server) · admin → null (ve todo) */
export function scopeDuenio(): number | null {
  const s = sesionActual()
  if (s?.rol === 'duenio') return s.id
  return null
}

const deDuenio = <T extends { duenioId?: number }>(rows: T[], scope: number | null): T[] =>
  scope == null ? rows : rows.filter(r => r.duenioId == null || r.duenioId === scope)

export function useDatos() {
  const v = useStoreVersion()
  const scope = scopeDuenio()
  return useMemo(() => {
    const usuarios = all('usuarios')
    const productos = [...all('productos')].sort((a, b) => a.orden - b.orden)
    const puestos = [...all('puestos')].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    const vendedores = usuarios
      .filter(u => u.rol === 'vendedor')
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    return {
      productos: deDuenio(productos, scope),
      puestos: deDuenio(puestos, scope),
      vendedores: deDuenio(vendedores, scope),
      usuarios,
      scope,
      cargando: false,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, v])
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
  const v = useStoreVersion()
  const scope = scopeDuenio()
  return useMemo(() => {
    const us = all('usuarios')
    const ps = all('puestos')
    return all('jornadas')
      .filter(j => j.fecha === fecha)
      .filter(j => jornadaDeScope(j, scope, us, ps))
      .sort((a, b) => (a.puestoId ?? 0) - (b.puestoId ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, scope, v])
}

export function useJornadasRango(desde: string, hasta: string): Jornada[] {
  const v = useStoreVersion()
  const scope = scopeDuenio()
  return useMemo(() => {
    const us = all('usuarios')
    const ps = all('puestos')
    return all('jornadas')
      .filter(j => j.fecha >= desde && j.fecha <= hasta)
      .filter(j => jornadaDeScope(j, scope, us, ps))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, scope, v])
}

export function useJornadaVendedor(vendedorId: number | null, fecha: string): Jornada | undefined {
  const v = useStoreVersion()
  return useMemo(() => {
    if (vendedorId == null) return undefined
    // puede haber varias (turnos consecutivos) → la activa primero, si no la última
    const js = all('jornadas')
      .filter(j => j.fecha === fecha && j.vendedorId === vendedorId)
      .sort((a, b) => a.createdAt - b.createdAt)
    return js.find(j => j.estado !== 'confirmada') ?? js[js.length - 1]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedorId, fecha, v])
}

export function useVentasDe(jornadaId: number | undefined): Venta[] {
  const v = useStoreVersion()
  return useMemo(
    () =>
      jornadaId == null
        ? []
        : all('ventas').filter(x => x.jornadaId === jornadaId).sort((a, b) => a.createdAt - b.createdAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jornadaId, v],
  )
}

export function useVentasDeJornadas(jornadaIds: number[]): Venta[] {
  const v = useStoreVersion()
  const key = jornadaIds.join(',')
  return useMemo(() => {
    if (jornadaIds.length === 0) return []
    const set = new Set(jornadaIds)
    return all('ventas').filter(x => set.has(x.jornadaId)).sort((a, b) => a.createdAt - b.createdAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v])
}

export function useSolicitudesPendientes(): Solicitud[] {
  const v = useStoreVersion()
  const scope = scopeDuenio()
  return useMemo(() => {
    const us = all('usuarios')
    const ss = all('solicitudes').filter(s => s.estado === 'pendiente')
    return scope == null
      ? ss
      : ss.filter(s => {
          const u = us.find(x => x.id === s.vendedorId)
          return u?.duenioId === scope
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, v])
}

export function useJornadasLibres(fecha: string): Jornada[] {
  const v = useStoreVersion()
  const scope = scopeDuenio()
  return useMemo(() => {
    const us = all('usuarios')
    const ps = all('puestos')
    return all('jornadas')
      .filter(j => j.fecha === fecha && j.vendedorId == null)
      .filter(j => jornadaDeScope(j, scope, us, ps))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, scope, v])
}
