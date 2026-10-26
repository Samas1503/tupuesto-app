import type { Jornada, Linea, Producto, Venta } from '../types'

/** cantidad de un producto dentro de una lista de líneas */
function qty(lineas: Linea[] | undefined, productoId: number): number {
  return lineas?.find(l => l.productoId === productoId)?.cantidad ?? 0
}

/** total cargado de un producto: despacho inicial + todas las reposiciones */
/** total cargado de un producto: despacho inicial + saldo de ayer + reposiciones */
export function cargado(j: Jornada, productoId: number): number {
  const repos = (j.reposiciones ?? []).reduce((a, r) => a + qty(r.items, productoId), 0)
  return qty(j.despacho, productoId) + qty(j.saldoInicial, productoId) + repos
}

/** $ perdido por sobrante descartado (a precioCosto) */
export function perdidaDescarte(j: Jornada, productos: Producto[]): number {
  return (j.descarte ?? []).reduce(
    (a, l) => a + l.cantidad * (productos.find(p => p.id === l.productoId)?.precioCosto ?? 0),
    0,
  )
}

/** unidades vendidas inferidas por producto: cargado − remanente − merma (nunca negativo) */
export function vendidos(j: Jornada, productoId: number): number {
  const v = cargado(j, productoId) - qty(j.cierre?.remanente, productoId) - qty(j.cierre?.merma, productoId)
  return Math.max(0, v)
}

/** Σ vendido × precio al momento del cierre */
export function totalVentas(j: Jornada, productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + vendidos(j, p.id!) * p.precio, 0)
}

/** lo que debería haber: fondo + ventas */
export function esperado(j: Jornada, productos: Producto[]): number {
  return (j.fondoCaja ?? 0) + totalVentas(j, productos)
}

/** lo que el vendedor presentó: efectivo + digital declarado */
export function cobrado(j: Jornada): number {
  return (j.cierre?.efectivoContado ?? 0) + (j.cierre?.qrTotal ?? 0)
}

/** positivo = sobrante, negativo = faltante */
export function diferencia(j: Jornada, productos: Producto[]): number {
  return cobrado(j) - esperado(j, productos)
}

/** valor de la merma declarada a precio de venta */
export function mermaValor(j: Jornada, productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + qty(j.cierre?.merma, p.id!) * p.precio, 0)
}

/** valor de la mercadería despachada */
export function despachoValor(j: Jornada, productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + cargado(j, p.id!) * p.precio, 0)
}

/** unidades totales de merma declarada */
export function mermaUnidades(j: Jornada): number {
  return (j.cierre?.merma ?? []).reduce((a, l) => a + l.cantidad, 0)
}

/** flag del wedge: cobros QR que fueron a una cuenta que no es del negocio */
export function qrFueraDeCuenta(j: Jornada): boolean {
  return !!j.cierre && j.cierre.qrTotal > 0 && j.cierre.qrDestino === 'vendedor'
}

/** flag estadístico: el puesto declaró $0 en QR (a contrastar con su promedio) */
export function qrEnCero(j: Jornada): boolean {
  return !!j.cierre && j.cierre.qrTotal === 0
}

/* ── ventas registradas en el turno ─────────────────────── */

/** total cobrado registrado en ventas durante el turno */
export function ventasTotal(ventas: Venta[]): number {
  return ventas.reduce((a, v) => a + v.total, 0)
}

/** unidades vendidas registradas de un producto (por todas las ventas del turno) */
export function vendidosRegistrados(ventas: Venta[], productoId: number): number {
  return ventas.reduce((a, v) => a + qty(v.items, productoId), 0)
}

/** ganancia potencial del despacho: Σ despacho × (precio − costo) */
export function gananciaPotencial(j: Jornada, productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + cargado(j, p.id!) * (p.precio - (p.precioCosto ?? 0)), 0)
}

/** margen ya ganado: cerrada → conteo físico · abierta → registro del turno */
export function gananciaReal(j: Jornada, ventas: Venta[], productos: Producto[]): number {
  const vendidoDe = (pid: number) =>
    j.cierre ? vendidos(j, pid) : vendidosRegistrados(ventas, pid)
  return productos.reduce((a, p) => a + vendidoDe(p.id!) * (p.precio - (p.precioCosto ?? 0)), 0)
}

/** stock que queda según registro: cargado (despacho + repos) − vendido registrado */
export function stockActual(j: Jornada, ventas: Venta[], productoId: number): number {
  return Math.max(0, cargado(j, productoId) - vendidosRegistrados(ventas, productoId))
}

/** unidades repuestas de un producto durante el turno */
export function repuestas(j: Jornada, productoId: number): number {
  return (j.reposiciones ?? []).reduce((a, r) => a + qty(r.items, productoId), 0)
}

/** umbral de reposición: unidades en las que conviene reponer */
export const UMBRAL_REPOSICION = 3

/**
 * cruce de fuentes: diferencia en $ entre lo vendido según conteo físico
 * y lo vendido según registro del vendedor. 0 = cierra, ≠0 = a revisar.
 */
export function cruceCierre(j: Jornada, ventas: Venta[], productos: Producto[]): number {
  const vendidoRegistro = productos.reduce((acc, p) => acc + vendidosRegistrados(ventas, p.id!) * p.precio, 0)
  return totalVentas(j, productos) - vendidoRegistro
}

/** costo de producción de lo vendido (Σ vendidos × precioCosto) */
export function costoVentas(j: Jornada, productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + vendidos(j, p.id!) * (p.precioCosto ?? 0), 0)
}

/** horas del turno: creación → cierre/confirmación/ahora */
export function horasTurno(j: Jornada): number {
  const fin = j.cierre?.cerradaAt ?? j.confirmadaAt ?? Date.now()
  return Math.max(0, (fin - j.createdAt) / 3600e3)
}
