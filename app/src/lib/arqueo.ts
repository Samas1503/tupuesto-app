import type { Jornada, Linea, Producto } from '../types'

/** cantidad de un producto dentro de una lista de líneas */
function qty(lineas: Linea[] | undefined, productoId: number): number {
  return lineas?.find(l => l.productoId === productoId)?.cantidad ?? 0
}

/** unidades vendidas inferidas por producto: cargado − remanente − merma (nunca negativo) */
export function vendidos(j: Jornada, productoId: number): number {
  const v = qty(j.despacho, productoId) - qty(j.cierre?.remanente, productoId) - qty(j.cierre?.merma, productoId)
  return Math.max(0, v)
}

/** Σ vendido × precio al momento del cierre */
export function totalVentas(j: Jornada, productos: Producto[]): number {
  return productos.reduce((acc, p) => acc + vendidos(j, p.id!) * p.precio, 0)
}

/** lo que debería haber: fondo + ventas */
export function esperado(j: Jornada, productos: Producto[]): number {
  return j.fondoCaja + totalVentas(j, productos)
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
  return productos.reduce((acc, p) => acc + qty(j.despacho, p.id!) * p.precio, 0)
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
