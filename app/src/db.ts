import Dexie, { type Table } from 'dexie'
import type { Duenio, Jornada, Linea, Producto, Puesto, Solicitud, Vendedor, Venta } from './types'
import { hoyISO, isoMenosDias } from './lib/format'

export class TuPuestoDB extends Dexie {
  productos!: Table<Producto, number>
  puestos!: Table<Puesto, number>
  vendedores!: Table<Vendedor, number>
  jornadas!: Table<Jornada, number>
  ventas!: Table<Venta, number>
  solicitudes!: Table<Solicitud, number>
  duenios!: Table<Duenio, number>

  constructor() {
    super('tupuesto')
    this.version(1).stores({      productos: '++id, orden, activo',
      puestos: '++id, activo',
      vendedores: '++id, puestoId, activo',
      jornadas: '++id, fecha, puestoId, vendedorId, estado, [fecha+puestoId]',
    })
    // v2: índice compuesto para "la jornada de ESTE vendedor hoy" (MiDia)
    this.version(2).stores({
      jornadas: '++id, fecha, puestoId, vendedorId, estado, [fecha+puestoId], [fecha+vendedorId]',
    })
    // v3: registro de ventas en el turno
    this.version(3).stores({
      ventas: '++id, jornadaId, createdAt',
    })
    // v4: solicitudes del vendedor al admin
    this.version(4).stores({
      solicitudes: '++id, estado, vendedorId, createdAt',
    })
    // v5: dueños gestionados por el admin del sistema
    this.version(5).stores({
      duenios: '++id, email',
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

/** placeholder chico (<500B): inicial del producto sobre el accent #635bff */
const img = (letra: string) =>
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' rx='12' fill='%23635bff'/%3E%3Ctext x='32' y='42' font-size='32' fill='%23fff' text-anchor='middle' font-family='sans-serif'%3E${letra}%3C/text%3E%3C/svg%3E`

const PRODUCTOS_SEED: Omit<Producto, 'id'>[] = [
  { nombre: 'Chipá (u.)', precio: 550, precioCosto: 380, imagen: img('C'), ingredientes: 'almidón de mandioca, queso, huevo, manteca', activo: true, orden: 1 },
  { nombre: 'Docena chipá', precio: 6000, precioCosto: 4000, imagen: img('D'), ingredientes: 'almidón de mandioca, queso, huevo, manteca', activo: true, orden: 2 },
  { nombre: 'Sándwich de miga', precio: 4800, precioCosto: 3200, imagen: img('S'), ingredientes: 'pan de miga, jamón, queso, huevo, mayonesa', activo: true, orden: 3 },
  { nombre: 'Medialuna', precio: 600, precioCosto: 380, imagen: img('M'), ingredientes: 'harina, manteca, azúcar, huevo, esencia de vainilla', activo: true, orden: 4 },
  { nombre: 'Gaseosa 500 ml', precio: 2500, precioCosto: 1400, imagen: img('G'), activo: true, orden: 5 },
  { nombre: 'Alfajor', precio: 1800, precioCosto: 1100, imagen: img('A'), ingredientes: 'dulce de leche, chocolate, tapitas de maizena', activo: true, orden: 6 },
]

/** DB ya seedeada de una versión vieja: completa precioCosto/imagen sin pisar datos */
async function backfillProductos() {
  const actuales = await db.productos.toArray()
  const updates = actuales
    .filter(p => p.precioCosto === undefined || p.imagen === undefined)
    .map(p => {
      const seed = PRODUCTOS_SEED.find(s => s.nombre === p.nombre)
      if (!seed) return p
      return { ...p, precioCosto: p.precioCosto ?? seed.precioCosto, imagen: p.imagen ?? seed.imagen }
    })
  if (updates.length) await db.productos.bulkPut(updates)
}

// backfill pins de vendedores en DBs viejas (match por nombre)
const PINS_SEED: Record<string, string> = { Marcos: '1234', Alejandra: '2345', Diego: '3456' }
async function backfillVendedores() {
  const vs = await db.vendedores.toArray()
  const faltan = vs.filter(v => !v.pin && PINS_SEED[v.nombre])
    .map(v => ({ ...v, pin: PINS_SEED[v.nombre] }))
  if (faltan.length) await db.vendedores.bulkPut(faltan)
}

/** hidrata la DB desde el archivo estático (demo Vercel) — devuelve false si no está */
async function cargarDesdeSqlite(): Promise<boolean> {
  try {
    const res = await fetch('/tupuesto.sqlite')
    if (!res.ok) return false
    const initSqlJs = (await import('sql.js')).default
    const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' })
    const sq = new SQL.Database(new Uint8Array(await res.arrayBuffer()))
    const tablas = <T,>(q: string, map: (r: Record<string, unknown>) => T): T[] => {
      const rs = sq.exec(q)
      if (!rs.length) return []
      return rs[0].values.map((row: unknown[]) => Object.fromEntries(rs[0].columns.map((c: string, i: number) => [c, row[i]])) as Record<string, unknown>).map(map)
    }
    const J = (v: unknown) => (v ? JSON.parse(v as string) : undefined)
    await db.transaction('rw', [db.productos, db.puestos, db.vendedores, db.jornadas, db.ventas, db.solicitudes], async () => {
      await db.productos.bulkPut(tablas('SELECT * FROM productos', r => ({ id: r.id as number, nombre: r.nombre as string, precio: r.precio as number, precioCosto: r.precioCosto as number ?? undefined, imagen: r.imagen as string ?? undefined, ingredientes: r.ingredientes as string ?? undefined, activo: !!r.activo, orden: r.orden as number })) as Producto[])
      await db.puestos.bulkPut(tablas('SELECT * FROM puestos', r => ({ id: r.id as number, nombre: r.nombre as string, ubicacion: r.ubicacion as string, qrDestinoDefault: r.qrDestinoDefault as Puesto['qrDestinoDefault'], activo: !!r.activo })) as Puesto[])
      await db.vendedores.bulkPut(tablas('SELECT * FROM vendedores', r => ({ id: r.id as number, nombre: r.nombre as string, puestoId: r.puestoId as number ?? undefined, email: r.email as string ?? undefined, pin: r.pin as string ?? undefined, debeCambiarPin: !!r.debeCambiarPin, activo: !!r.activo })) as Vendedor[])
      await db.jornadas.bulkPut(tablas('SELECT * FROM jornadas', r => ({ id: r.id as number, puestoId: r.puestoId as number, vendedorId: r.vendedorId as number ?? undefined, fecha: r.fecha as string, fondoCaja: r.fondoCaja as number ?? undefined, despacho: J(r.despacho), reposiciones: J(r.reposiciones), estado: r.estado as Jornada['estado'], cierre: J(r.cierre), confirmadaAt: r.confirmadaAt as number ?? undefined, createdAt: r.createdAt as number })) as Jornada[])
      await db.ventas.bulkPut(tablas('SELECT * FROM ventas', r => ({ id: r.id as number, jornadaId: r.jornadaId as number, items: J(r.items), total: r.total as number, metodoPago: r.metodoPago as Venta['metodoPago'], createdAt: r.createdAt as number })) as Venta[])
      await db.solicitudes.bulkPut(tablas('SELECT * FROM solicitudes', r => ({ id: r.id as number, tipo: r.tipo as 'eliminar-usuario', vendedorId: r.vendedorId as number, solicitadoPor: r.solicitadoPor as number, motivo: r.motivo as string ?? undefined, estado: r.estado as 'pendiente', createdAt: r.createdAt as number, resueltaAt: r.resueltaAt as number ?? undefined })))
    })
    return true
  } catch (e) {
    console.warn('sqlite no disponible, uso seed local', e)
    return false
  }
}

const DUENIOS_SEED: Duenio[] = [
  { nombre: 'Patricio (demo)', email: 'duenio@demo.tupuesto', pin: '0000', activo: true },
]

export async function seedIfEmpty() {
  if ((await db.duenios.count()) === 0) await db.duenios.bulkPut(DUENIOS_SEED)
  if (await db.puestos.count() === 0 && await cargarDesdeSqlite()) return
  if ((await db.puestos.count()) > 0) {
    await backfillProductos()
    await backfillVendedores()
    return
  }

  await db.transaction('rw', db.productos, db.puestos, db.vendedores, db.jornadas, db.ventas, async () => {
    await db.productos.bulkAdd(PRODUCTOS_SEED as Producto[])
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
      { nombre: 'Marcos', puestoId: psts[0].id!, email: 'marcos@demo.tupuesto', pin: '1234', activo: true },
      { nombre: 'Alejandra', puestoId: psts[1].id!, email: 'alejandra@demo.tupuesto', pin: '2345', activo: true },
      { nombre: 'Diego', puestoId: psts[2].id!, email: 'diego@demo.tupuesto', pin: '3456', activo: true },
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
      reposiciones: [{ items: [L(0, 30), L(3, 10)], createdAt: Date.now() - 3 * 3600e3 }],
      estado: 'abierta',
      createdAt: Date.now() - 10 * 3600e3,
    })

    await db.jornadas.bulkAdd(hist)

    // ── Ventas registradas por Marcos durante la mañana de hoy ──
    const jornadaMarcos = await db.jornadas
      .where('[fecha+puestoId]')
      .equals([hoyISO(), psts[0].id!])
      .first()
    const hoy0 = new Date(hoyISO()).getTime()
    const ventasDemo: Omit<Venta, 'id'>[] = [
      {
        jornadaId: jornadaMarcos!.id!,
        items: [
          { productoId: pid(0), cantidad: 10 },
          { productoId: pid(4), cantidad: 2 },
        ],
        total: 10 * 550 + 2 * 2500, // 10.500
        metodoPago: 'efectivo',
        createdAt: hoy0 + 9 * 3600e3,
      },
      {
        jornadaId: jornadaMarcos!.id!,
        items: [
          { productoId: pid(1), cantidad: 1 },
          { productoId: pid(2), cantidad: 2 },
        ],
        total: 6000 + 2 * 4800, // 15.600
        metodoPago: 'qr',
        createdAt: hoy0 + 10.5 * 3600e3,
      },
      {
        jornadaId: jornadaMarcos!.id!,
        items: [
          { productoId: pid(3), cantidad: 5 },
          { productoId: pid(5), cantidad: 3 },
        ],
        total: 5 * 600 + 3 * 1800, // 8.400
        metodoPago: 'efectivo',
        createdAt: hoy0 + 11.75 * 3600e3,
      },
    ]
    await db.ventas.bulkAdd(ventasDemo as Venta[])
  })
}
