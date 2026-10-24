// Scoring de vendedores — SOLO ADMIN. Los vendedores nunca ven su puntaje:
// la vista (AdminScores) solo se monta dentro del rol admin.
//
// FÓRMULA (base 100 + bonus, clamp 0–100). Todos los insumos se calculan sobre
// la ventana de los últimos PERIODO_SCORE_DIAS días ("últimas 2 semanas"):
//
//   total = clamp(0, 100, exactitud + frecuencia + merma + volumen + bonus)
//
//   • Exactitud de caja  (40 pts): promedio por jornada CERRADA del vendedor de
//         1 − min(1, |esperado − contado| / max(esperado, 1))
//     esperado = fondoCaja + ventas por conteo físico   (lib/arqueo `esperado`)
//     contado  = cierre.efectivoContado + cierre.qrTotal (lib/arqueo `cobrado`)
//     dif = 0 → 1 ·; |dif| ≥ esperado → 0. Sin jornadas cerradas → 0 puntos
//     (no hay evidencia de exactitud).
//
//   • Frecuencia         (25 pts): jornadas trabajadas en la ventana /
//     DIAS_HABILES_ESPERADOS (12 = 6 días/semana × 2 semanas), clamp a 1.
//
//   • Merma              (15 pts): 1 − min(1, pérdidaTotal / valorMovido)
//     pérdidaTotal = Σ perdidaDescarte(j) — sobrante de ayer descartado, a
//     precioCosto (lib/arqueo). valorMovido = Σ cargado(j) × precioCosto —
//     mismo denominador en costo para que el ratio sea comparable.
//     Sin mercadería movida → 1 (no hubo pérdida posible).
//
//   • Volumen            (20 pts): $ vendido del vendedor / max $ vendido de
//     todos los vendedores del período (relativo al mejor del equipo).
//     Jornada cerrada → totalVentas (conteo físico); abierta → ventasTotal
//     (registro del turno). Nadie vendió → 0 para todos.
//
//   • Bonus              (+10): ≥3 jornadas confirmadas en la ventana Y sin
//     solicitudes pendientes (estado 'pendiente') sobre el vendedor.
//
// Nota: los "cierres" no son una tabla aparte — viven embebidos en
// `jornada.cierre` (JSONB en Neon), por eso no van como parámetro.
import type { Jornada, Producto, Solicitud, Usuario, Venta } from '../types'
import { cargado, cobrado, esperado, perdidaDescarte, totalVentas, ventasTotal } from './arqueo'
import { isoMenosDias } from './format'

/** días de la ventana de evaluación ("últimas 2 semanas") */
export const PERIODO_SCORE_DIAS = 14
/** días hábiles esperados en la ventana (6 días × 2 semanas) — para frecuencia */
export const DIAS_HABILES_ESPERADOS = 12
/** confirmadas mínimas para el bonus */
export const BONUS_MIN_CONFIRMADAS = 3

/** puntos máximos de cada componente — documentados para la vista */
export const PESOS = { exactitud: 40, frecuencia: 25, merma: 15, volumen: 20, bonus: 10 } as const

/** datos de entrada del scoring — todo Dexie, sin queries internas (testeable) */
export interface DatosScore {
  jornadas: Jornada[]
  ventas: Venta[]
  productos: Producto[]
  solicitudes: Solicitud[]
}

export interface BreakdownScore {
  /** 0–40 · qué tan bien cierra la caja */
  exactitud: number
  /** 0–25 · cuántos días trabajó vs esperados */
  frecuencia: number
  /** 0–15 · cuánta mercadería se pierde por descarte */
  merma: number
  /** 0–20 · $ vendido relativo al mejor del equipo */
  volumen: number
  /** 0 o +10 · ≥3 confirmadas sin solicitudes pendientes */
  bonus: number
}

export interface ScoreVendedor {
  /** 0–100, redondeado */
  total: number
  breakdown: BreakdownScore
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** $ vendido de UNA jornada: cerrada → conteo físico; abierta → registro del turno */
function vendidoJornada(j: Jornada, ventas: Venta[], productos: Producto[]): number {
  return j.cierre
    ? totalVentas(j, productos)
    : ventasTotal(ventas.filter(v => v.jornadaId === j.id))
}

export function scoreVendedor(v: Usuario, datos: DatosScore): ScoreVendedor {
  const { jornadas, ventas, productos, solicitudes } = datos
  const desde = isoMenosDias(PERIODO_SCORE_DIAS)
  const jsPeriodo = jornadas.filter(j => j.fecha >= desde)
  const js = jsPeriodo.filter(j => j.vendedorId === v.id)
  const cerradas = js.filter(j => j.cierre)

  // ── Exactitud de caja (40) ──────────────────────────────
  const exactitud =
    cerradas.length === 0
      ? 0
      : (cerradas.reduce((a, j) => {
          const esp = esperado(j, productos)
          const ratio = 1 - Math.min(1, Math.abs(esp - cobrado(j)) / Math.max(esp, 1))
          return a + ratio
        }, 0) /
          cerradas.length) *
        PESOS.exactitud

  // ── Frecuencia (25) ─────────────────────────────────────
  const frecuencia = Math.min(1, js.length / DIAS_HABILES_ESPERADOS) * PESOS.frecuencia

  // ── Merma / descarte (15) ───────────────────────────────
  const perdida = js.reduce((a, j) => a + perdidaDescarte(j, productos), 0)
  const valorMovido = js.reduce(
    (a, j) => a + productos.reduce((x, p) => x + cargado(j, p.id!) * (p.precioCosto ?? 0), 0),
    0,
  )
  const merma =
    (valorMovido > 0 ? 1 - Math.min(1, perdida / valorMovido) : 1) * PESOS.merma

  // ── Volumen (20) — relativo al mejor vendedor del período ─
  const vendidoPorVendedor = new Map<number, number>()
  for (const j of jsPeriodo) {
    if (j.vendedorId == null) continue
    vendidoPorVendedor.set(
      j.vendedorId,
      (vendidoPorVendedor.get(j.vendedorId) ?? 0) + vendidoJornada(j, ventas, productos),
    )
  }
  const vendido = v.id != null ? (vendidoPorVendedor.get(v.id) ?? 0) : 0
  const maxVendido = Math.max(0, ...vendidoPorVendedor.values())
  const volumen = (maxVendido > 0 ? vendido / maxVendido : 0) * PESOS.volumen

  // ── Bonus (+10) ─────────────────────────────────────────
  const confirmadas = js.filter(j => j.estado === 'confirmada').length
  const pendiente =
    v.id != null &&
    solicitudes.some(s => s.vendedorId === v.id && s.estado === 'pendiente')
  const bonus = confirmadas >= BONUS_MIN_CONFIRMADAS && !pendiente ? PESOS.bonus : 0

  return {
    total: Math.round(clamp(exactitud + frecuencia + merma + volumen + bonus, 0, 100)),
    breakdown: { exactitud, frecuencia, merma, volumen, bonus },
  }
}

/** dueño — score por cómo administra sus recursos: exactitud del equipo,
 *  merma del negocio, volumen vendido y frecuencia de turnos de su gente */
export function scoreDuenio(d: Usuario, usuarios: Usuario[], datos: DatosScore): ScoreVendedor {
  const { jornadas, ventas, productos, solicitudes } = datos
  const desde = isoMenosDias(PERIODO_SCORE_DIAS)
  const equipo = usuarios.filter(u => u.rol === 'vendedor' && u.duenioId === d.id && !u.eliminado)
  const ids = new Set(equipo.map(v => v.id))
  const js = jornadas.filter(j => j.fecha >= desde && j.vendedorId != null && ids.has(j.vendedorId))
  const cerradas = js.filter(j => j.cierre)

  const exactitud =
    cerradas.length === 0
      ? 0
      : (cerradas.reduce((a, j) => {
          const esp = esperado(j, productos)
          return a + (1 - Math.min(1, Math.abs(esp - cobrado(j)) / Math.max(esp, 1)))
        }, 0) /
          cerradas.length) *
        PESOS.exactitud

  // frecuencia relativa al equipo: jornadas / (días hábiles × vendedores)
  const frecuencia = Math.min(1, js.length / (DIAS_HABILES_ESPERADOS * Math.max(1, equipo.length))) * PESOS.frecuencia

  const perdida = js.reduce((a, j) => a + perdidaDescarte(j, productos), 0)
  const valorMovido = js.reduce(
    (a, j) => a + productos.reduce((x, p) => x + cargado(j, p.id!) * (p.precioCosto ?? 0), 0),
    0,
  )
  const merma = (valorMovido > 0 ? 1 - Math.min(1, perdida / valorMovido) : 1) * PESOS.merma

  // volumen relativo al mejor dueño del período
  const vendidoPorDuenio = new Map<number, number>()
  for (const d2 of usuarios.filter(u => u.rol === 'duenio' && !u.eliminado)) {
    const eq = new Set(usuarios.filter(v => v.rol === 'vendedor' && v.duenioId === d2.id && !v.eliminado).map(v => v.id))
    vendidoPorDuenio.set(
      d2.id!,
      jornadas
        .filter(j => j.fecha >= desde && j.vendedorId != null && eq.has(j.vendedorId))
        .reduce((a, j) => a + vendidoJornada(j, ventas, productos), 0),
    )
  }
  const vendido = d.id != null ? (vendidoPorDuenio.get(d.id) ?? 0) : 0
  const maxVendido = Math.max(0, ...vendidoPorDuenio.values())
  const volumen = (maxVendido > 0 ? vendido / maxVendido : 0) * PESOS.volumen

  const confirmadas = js.filter(j => j.estado === 'confirmada').length
  const pendiente = solicitudes.some(
    s => s.estado === 'pendiente' && s.vendedorId != null && ids.has(s.vendedorId),
  )
  const bonus = confirmadas >= BONUS_MIN_CONFIRMADAS && !pendiente ? PESOS.bonus : 0

  return {
    total: Math.round(clamp(exactitud + frecuencia + merma + volumen + bonus, 0, 100)),
    breakdown: { exactitud, frecuencia, merma, volumen, bonus },
  }
}

/** ranking de TODOS los usuarios (vendedores + dueños, no eliminados), score desc */
export function scoreTodos(usuarios: Usuario[], datos: DatosScore) {
  return usuarios
    .filter(u => u.rol !== 'admin' && !u.eliminado)
    .map(usuario => ({
      usuario,
      ... (usuario.rol === 'vendedor'
        ? scoreVendedor(usuario, datos)
        : scoreDuenio(usuario, usuarios, datos)),
    }))
    .sort((a, b) => b.total - a.total)
}
