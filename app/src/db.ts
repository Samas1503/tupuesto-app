import Dexie, { type Table } from 'dexie'
import type { Jornada, Linea, Producto, Puesto, Vendedor } from './types'
import { hoyISO, isoMenosDias } from './lib/format'

export class TuPuestoDB extends Dexie {
  productos!: Table<Producto, number>
  puestos!: Table<Puesto, number>
  vendedores!: Table<Vendedor, number>
  jornadas!: Table<Jornada, number>

  constructor() {
    super('tupuesto')
    this.version(1).stores({
      productos: '++id, orden, activo',
      puestos: '++id, activo',
      vendedores: '++id, puestoId, activo',
      jornadas: '++id, fecha, puestoId, vendedorId, estado, [fecha+puestoId]',
    })
  }
}

export const db = new TuPuestoDB()

/* ── Seed demo: mismos nombres/puestos que la landing ───────────── */

// PRNG determinista para que la demo se vea igual en cada dispositivo
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function seedIfEmpty() {
  if ((await db.puestos.count()) > 0) return

  await db.transaction('rw', db.productos, db.puestos, db.vendedores, db.jornadas, async () => {
    const productos: Omit<Producto, 'id'>[] = [
      { nombre: 'Chipá (u.)', precio: 550, activo: true, orden: 1 },
      { nombre: 'Docena chipá', precio: 6000, activo: true, orden: 2 },
      { nombre: 'Sándwich de miga', precio: 4800, activo: true, orden: 3 },
      { nombre: 'Medialuna', precio: 600, activo: true, orden: 4 },
      { nombre: 'Gaseosa 500 ml', precio: 2500, activo: true, orden: 5 },
      { nombre: 'Alfajor', precio: 1800, activo: true, orden: 6 },
    ]
    await db.productos.bulkAdd(productos as Producto[])
    const prods = await db.productos.orderBy('orden').toArray()
    const pid = (i: number) => prods[i].id!

    const puestos: Omit<Puesto, 'id'>[] = [
      { nombre: 'Feria Central', ubicacion: 'Parque Centenario', qrDestinoDefault: 'negocio', activo: true },
      { nombre: 'Plaza Italia', ubicacion: 'Palermo', qrDestinoDefault: 'negocio', activo: true },
      { nombre: 'Costanera', ubicacion: 'Sur, entrada bici', qrDestinoDefault: 'vendedor', activo: true },
    ]
    await db.puestos.bulkAdd(puestos as Puesto[])
    const psts = await db.puestos.orderBy('id').toArray()

    const vendedores: Omit<Vendedor, 'id'>[] = [
      { nombre: 'Marcos', puestoId: psts[0].id!, activo: true },
      { nombre: 'Alejandra', puestoId: psts[1].id!, activo: true },
      { nombre: 'Diego', puestoId: psts[2].id!, activo: true },
    ]
    await db.vendedores.bulkAdd(vendedores as Vendedor[])
    const vends = await db.vendedores.orderBy('id').toArray()

    const L = (i: number, cantidad: number): Linea => ({ productoId: pid(i), cantidad })

    // ── Historial: últimas 4 semanas ──
    const hist: Jornada[] = []
    for (let d = 28; d >= 1; d--) {
      for (let p = 0; p < 3; p++) {
        const r = rng(d * 31 + p * 7)
        if (r() < 0.18) continue // ese día el puesto no salió
        const fecha = isoMenosDias(d)
        const despacho: Linea[] = [
          L(0, 140 + Math.floor(r() * 80)),
          L(1, 6 + Math.floor(r() * 6)),
          L(2, 12 + Math.floor(r() * 10)),
          L(3, 40 + Math.floor(r() * 30)),
          L(4, 15 + Math.floor(r() * 12)),
          L(5, 12 + Math.floor(r() * 10)),
        ]
        const remanente: Linea[] = []
        const merma: Linea[] = []
        let ventas = 0
        despacho.forEach((linea, i) => {
          const vendidas = Math.floor(linea.cantidad * (0.55 + r() * 0.35))
          // Plaza Italia merma más (Alejandra, la anomalía de la landing)
          const m = i === 0 || i === 3 ? Math.floor(r() * (p === 1 ? 9 : 3)) : Math.floor(r() * 2)
          const rem = Math.max(0, linea.cantidad - vendidas - m)
          if (rem > 0) remanente.push({ productoId: linea.productoId, cantidad: rem })
          if (m > 0) merma.push({ productoId: linea.productoId, cantidad: m })
          ventas += vendidas * prods[i].precio
        })
        const fondoCaja = 20000
        const esperado = fondoCaja + ventas
        const qrTotal = Math.floor(ventas * (0.15 + r() * 0.3))
        // diferencia ocasional (faltante o sobrante chico)
        const dif = r() < 0.12 ? -Math.floor(r() * 12000 + 2000) : r() < 0.2 ? Math.floor(r() * 3000) : 0
        hist.push({
          puestoId: psts[p].id!,
          vendedorId: vends[p].id!,
          fecha,
          fondoCaja,
          despacho,
          estado: 'confirmada',
          confirmadaAt: new Date(fecha).getTime() + 22 * 3600e3,
          cierre: {
            remanente,
            merma,
            efectivoContado: esperado - qrTotal + dif,
            qrTotal,
            qrDestino: psts[p].qrDestinoDefault,
            cerradaAt: new Date(fecha).getTime() + 20 * 3600e3,
          },
          createdAt: new Date(fecha).getTime() + 7 * 3600e3,
        })
      }
    }

    // ── Hoy: el escenario de la landing ──
    // Marcos: cierra sin diferencia
    hist.push({
      puestoId: psts[0].id!,
      vendedorId: vends[0].id!,
      fecha: hoyISO(),
      fondoCaja: 20000,
      despacho: [L(0, 160), L(1, 8), L(2, 15), L(3, 45), L(4, 18), L(5, 15)],
      estado: 'cerrada',
      cierre: {
        remanente: [L(0, 30), L(1, 1), L(2, 3), L(3, 12), L(4, 4), L(5, 3)],
        merma: [L(0, 4)],
        efectivoContado: 0, // se calcula abajo
        qrTotal: 0,
        qrDestino: 'negocio',
        cerradaAt: Date.now() - 2 * 3600e3,
      },
      createdAt: Date.now() - 12 * 3600e3,
    })
    {
      const j = hist[hist.length - 1]
      const vend = (i: number, rem: number, mer: number) =>
        (j.despacho[i].cantidad - rem - mer) * prods[i].precio
      const ventas =
        vend(0, 30, 4) + vend(1, 1, 0) + vend(2, 3, 0) + vend(3, 12, 0) + vend(4, 4, 0) + vend(5, 3, 0)
      j.cierre!.qrTotal = Math.round(ventas * 0.35)
      j.cierre!.efectivoContado = 20000 + ventas - j.cierre!.qrTotal // dif = 0
    }

    // Alejandra: faltante $16.400 + merma alta (18 u)
    hist.push({
      puestoId: psts[1].id!,
      vendedorId: vends[1].id!,
      fecha: hoyISO(),
      fondoCaja: 20000,
      despacho: [L(0, 140), L(1, 6), L(2, 12), L(3, 40), L(4, 15), L(5, 12)],
      estado: 'cerrada',
      cierre: {
        remanente: [L(0, 25), L(1, 1), L(2, 2), L(3, 10), L(4, 3), L(5, 2)],
        merma: [L(0, 12), L(3, 6)],
        efectivoContado: 0,
        qrTotal: 0,
        qrDestino: 'negocio',
        cerradaAt: Date.now() - 1 * 3600e3,
      },
      createdAt: Date.now() - 12 * 3600e3,
    })
    {
      const j = hist[hist.length - 1]
      const vend = (i: number, rem: number, mer: number) =>
        (j.despacho[i].cantidad - rem - mer) * prods[i].precio
      const ventas =
        vend(0, 25, 12) + vend(1, 1, 0) + vend(2, 2, 0) + vend(3, 10, 6) + vend(4, 3, 0) + vend(5, 2, 0)
      j.cierre!.qrTotal = Math.round(ventas * 0.25)
      j.cierre!.efectivoContado = 20000 + ventas - j.cierre!.qrTotal - 16400 // faltante 16.400
    }

    // Diego: todavía abierto (vendiendo) — sin cierre
    hist.push({
      puestoId: psts[2].id!,
      vendedorId: vends[2].id!,
      fecha: hoyISO(),
      fondoCaja: 15000,
      despacho: [L(0, 120), L(1, 5), L(2, 10), L(3, 35), L(4, 20), L(5, 10)],
      estado: 'abierta',
      createdAt: Date.now() - 10 * 3600e3,
    })

    await db.jornadas.bulkAdd(hist)
  })
}
