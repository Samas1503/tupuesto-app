// Métricas del dashboard financiero del admin — funciones puras sobre los
// datos que ya cargan los hooks (`useDatos` + `useJornadasRango` +
// `useVentasDeJornadas` + `usuarios`). Sin estado, sin hooks, sin Dexie.
//
// Convención: el "$ movido" se calcula SIEMPRE sobre el registro de `ventas`
// (ventas.total) — igual que el resto de la app cuando una jornada sigue
// abierta. Las jornadas se usan para atribuir (jornada → puesto y
// jornada → vendedor → duenioId) y para detectar las abiertas hoy.

import type { Jornada, MetodoPago, Puesto, Usuario, Venta } from '../types'
import { hoyISO, isoMenosDias } from './format'

/** ISO local (YYYY-MM-DD) de un timestamp — igual criterio que hoyISO() */
function isoDeTs(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface FlujoDia {
  /** YYYY-MM-DD */
  fecha: string
  /** Σ ventas.total del día (0 si no hubo registro) */
  total: number
}

/**
 * $ movido por día, últimos `dias` días terminando hoy (para el sparkline).
 * Devuelve siempre `dias` puntos — días sin ventas quedan en 0.
 */
export function flujoPorDia(ventas: Venta[], dias: number): FlujoDia[] {
  const porFecha = new Map<string, number>()
  for (const v of ventas) {
    const f = isoDeTs(v.createdAt)
    porFecha.set(f, (porFecha.get(f) ?? 0) + v.total)
  }
  return Array.from({ length: dias }, (_, i) => {
    const fecha = isoMenosDias(dias - 1 - i)
    return { fecha, total: porFecha.get(fecha) ?? 0 }
  })
}

export interface DineroDuenio {
  duenio: Usuario
  /** Σ ventas.total atribuidas a sus vendedores */
  ingresos: number
  /** cantidad de ventas registradas */
  ventas: number
  /** vendedores activos (no eliminados) que cuelgan de este dueño */
  vendedores: number
}

/**
 * Ranking por dueño — el admin ve todo sin scoping.
 * Atribución: venta → jornada.vendedorId → vendedor.duenioId.
 * Dueños sin ventas en el rango aparecen igual (ingresos 0) — ordenado desc.
 */
export function porDuenio(usuarios: Usuario[], jornadas: Jornada[], ventas: Venta[]): DineroDuenio[] {
  const duenioDeVendedor = new Map<number, number | undefined>()
  for (const u of usuarios) {
    if (u.rol === 'vendedor' && u.id != null) duenioDeVendedor.set(u.id, u.duenioId)
  }
  const duenioDeJornada = new Map<number, number | undefined>()
  for (const j of jornadas) {
    if (j.id != null) {
      duenioDeJornada.set(j.id, j.vendedorId != null ? duenioDeVendedor.get(j.vendedorId) : undefined)
    }
  }
  const acum = new Map<number, { ingresos: number; ventas: number }>()
  for (const v of ventas) {
    const d = duenioDeJornada.get(v.jornadaId)
    if (d == null) continue
    const a = acum.get(d) ?? { ingresos: 0, ventas: 0 }
    a.ingresos += v.total
    a.ventas += 1
    acum.set(d, a)
  }
  return usuarios
    .filter(u => u.rol === 'duenio' && !u.eliminado)
    .map(duenio => ({
      duenio,
      ingresos: acum.get(duenio.id!)?.ingresos ?? 0,
      ventas: acum.get(duenio.id!)?.ventas ?? 0,
      vendedores: usuarios.filter(
        v => v.rol === 'vendedor' && v.duenioId === duenio.id && v.activo && !v.eliminado,
      ).length,
    }))
    .sort((a, b) => b.ingresos - a.ingresos)
}

export interface MetodoTotal {
  /** Σ ventas.total del método */
  total: number
  /** cantidad de ventas del método */
  cantidad: number
  /** % del $ total movido (0-100) — 0 si no hay ventas */
  pct: number
}

/** Desglose por método de pago: $ y % del total. Siempre las 3 claves. */
export function porMetodo(ventas: Venta[]): Record<MetodoPago, MetodoTotal> {
  const totales: Record<MetodoPago, { total: number; cantidad: number }> = {
    efectivo: { total: 0, cantidad: 0 },
    qr: { total: 0, cantidad: 0 },
    transferencia: { total: 0, cantidad: 0 },
  }
  let suma = 0
  for (const v of ventas) {
    const m = totales[v.metodoPago] ?? totales.efectivo
    m.total += v.total
    m.cantidad += 1
    suma += v.total
  }
  return {
    efectivo: { ...totales.efectivo, pct: suma > 0 ? (totales.efectivo.total / suma) * 100 : 0 },
    qr: { ...totales.qr, pct: suma > 0 ? (totales.qr.total / suma) * 100 : 0 },
    transferencia: { ...totales.transferencia, pct: suma > 0 ? (totales.transferencia.total / suma) * 100 : 0 },
  }
}

export interface DineroPuesto {
  puesto: Puesto
  /** Σ ventas.total registradas en jornadas del puesto */
  ingresos: number
  /** cantidad de ventas registradas */
  ventas: number
  /** jornadas del puesto en el rango */
  jornadas: number
}

/**
 * Ranking de puestos por $ generado (desc). Solo incluye puestos con
 * actividad en el rango (alguna jornada o alguna venta).
 */
export function porPuesto(puestos: Puesto[], jornadas: Jornada[], ventas: Venta[]): DineroPuesto[] {
  const puestoDeJornada = new Map<number, number>()
  const jornadasDePuesto = new Map<number, number>()
  for (const j of jornadas) {
    if (j.id != null) puestoDeJornada.set(j.id, j.puestoId)
    jornadasDePuesto.set(j.puestoId, (jornadasDePuesto.get(j.puestoId) ?? 0) + 1)
  }
  const acum = new Map<number, { ingresos: number; ventas: number }>()
  for (const v of ventas) {
    const p = puestoDeJornada.get(v.jornadaId)
    if (p == null) continue
    const a = acum.get(p) ?? { ingresos: 0, ventas: 0 }
    a.ingresos += v.total
    a.ventas += 1
    acum.set(p, a)
  }
  return puestos
    .map(puesto => ({
      puesto,
      ingresos: acum.get(puesto.id!)?.ingresos ?? 0,
      ventas: acum.get(puesto.id!)?.ventas ?? 0,
      jornadas: jornadasDePuesto.get(puesto.id!) ?? 0,
    }))
    .filter(x => x.jornadas > 0 || x.ingresos > 0)
    .sort((a, b) => b.ingresos - a.ingresos)
}

export interface JornadaAbierta {
  jornada: Jornada
  /** vendedor asignado (undefined si el despacho está libre) */
  vendedor?: Usuario
  /** $ vendido hasta ahora según el registro del turno */
  enCurso: number
}

/**
 * Jornadas de hoy en estado 'abierta' con su $ en curso — la plata que se
 * está moviendo ahora mismo. `usuarios` resuelve el nombre del vendedor.
 */
export function abiertasHoy(jornadas: Jornada[], ventas: Venta[], usuarios: Usuario[]): JornadaAbierta[] {
  const hoy = hoyISO()
  const enCursoDe = new Map<number, number>()
  for (const v of ventas) {
    enCursoDe.set(v.jornadaId, (enCursoDe.get(v.jornadaId) ?? 0) + v.total)
  }
  return jornadas
    .filter(j => j.fecha === hoy && j.estado === 'abierta')
    .map(jornada => ({
      jornada,
      vendedor: usuarios.find(u => u.id === jornada.vendedorId),
      enCurso: enCursoDe.get(jornada.id!) ?? 0,
    }))
    .sort((a, b) => b.enCurso - a.enCurso)
}
