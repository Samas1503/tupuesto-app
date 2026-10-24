// Genera public/tupuesto.sqlite con los datos demo (mismo contenido del seed Dexie)
// Uso: node scripts/gen-sqlite.mjs
import initSqlJs from 'sql.js'
import { writeFileSync } from 'node:fs'

const SQL = await initSqlJs()
const db = new SQL.Database()

db.run(`
CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT, precio INTEGER, precioCosto INTEGER, imagen TEXT, ingredientes TEXT, activo INTEGER, orden INTEGER);
CREATE TABLE puestos (id INTEGER PRIMARY KEY, nombre TEXT, ubicacion TEXT, qrDestinoDefault TEXT, activo INTEGER);
CREATE TABLE vendedores (id INTEGER PRIMARY KEY, nombre TEXT, puestoId INTEGER, email TEXT, pin TEXT, debeCambiarPin INTEGER, activo INTEGER);
CREATE TABLE jornadas (id INTEGER PRIMARY KEY, puestoId INTEGER, vendedorId INTEGER, fecha TEXT, fondoCaja INTEGER, despacho TEXT, reposiciones TEXT, estado TEXT, cierre TEXT, confirmadaAt INTEGER, createdAt INTEGER);
CREATE TABLE ventas (id INTEGER PRIMARY KEY, jornadaId INTEGER, items TEXT, total INTEGER, metodoPago TEXT, createdAt INTEGER);
CREATE TABLE solicitudes (id INTEGER PRIMARY KEY, tipo TEXT, vendedorId INTEGER, solicitadoPor INTEGER, motivo TEXT, estado TEXT, createdAt INTEGER, resueltaAt INTEGER);
CREATE TABLE duenios (id INTEGER PRIMARY KEY, nombre TEXT, email TEXT, pin TEXT, debeCambiarPin INTEGER, activo INTEGER, eliminado INTEGER);
`)

const img = (l) => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' rx='12' fill='%23635bff'/%3E%3Ctext x='32' y='42' font-size='32' fill='%23fff' text-anchor='middle' font-family='sans-serif'%3E${l}%3C/text%3E%3C/svg%3E`

const productos = [
  [1, 'Chipá (u.)', 550, 380, img('C'), 'almidón de mandioca, queso, huevo, manteca', 1, 1],
  [2, 'Docena chipá', 6000, 4000, img('D'), 'almidón de mandioca, queso, huevo, manteca', 1, 2],
  [3, 'Sándwich de miga', 4800, 3200, img('S'), 'pan de miga, jamón, queso, huevo, mayonesa', 1, 3],
  [4, 'Medialuna', 600, 380, img('M'), 'harina, manteca, azúcar, huevo, esencia de vainilla', 1, 4],
  [5, 'Gaseosa 500 ml', 2500, 1400, img('G'), null, 1, 5],
  [6, 'Alfajor', 1800, 1100, img('A'), 'dulce de leche, chocolate, tapitas de maizena', 1, 6],
]
const puestos = [
  [1, 'Feria Central', 'Parque Centenario', 'negocio', 1],
  [2, 'Plaza Italia', 'Palermo', 'negocio', 1],
  [3, 'Costanera', 'Sur, entrada bici', 'vendedor', 1],
]
const vendedores = [
  [1, 'Marcos', 1, 'marcos@demo.tupuesto', '1234', 0, 1],
  [2, 'Alejandra', 2, 'alejandra@demo.tupuesto', '2345', 0, 1],
  [3, 'Diego', 3, 'diego@demo.tupuesto', '3456', 0, 1],
]

const now = Date.now()
const hoy = new Date().toISOString().slice(0, 10)
const iso = (dAtras) => { const d = new Date(now - dAtras * 86400e3); return d.toISOString().slice(0, 10) }
const L = (i, n) => ({ productoId: productos[i][0], cantidad: n })

const jornadas = []
let jid = 1
// histórico 28d: por puesto, días laborables
for (let d = 27; d >= 1; d--) {
  for (const [pi, ps] of puestos.entries()) {
    if ((d + pi) % 7 === 6) continue // descansa 1 día/semana
    const base = [120 + pi * 15, 5 + pi, 10 + pi * 2, 30 + pi * 5, 15 + pi * 2, 10 + pi]
    const desp = base.map((n, i) => L(i, n))
    const rem = desp.map(l => ({ productoId: l.productoId, cantidad: Math.round(l.cantidad * 0.18) }))
    const vend = desp.map((l, i) => (l.cantidad - rem[i].cantidad) * productos[i][2])
    const ventas = vend.reduce((a, v) => a + v, 0)
    const qr = Math.round(ventas * (0.25 + (pi * 0.05)))
    const dif = pi === 1 && d % 5 === 0 ? -Math.round(ventas * 0.06) : 0 // Alejandra: faltante cada 5 días
    jornadas.push({
      puestoId: ps[0], vendedorId: vendedores[pi][0], fecha: iso(d), fondoCaja: 15000 + pi * 2500,
      despacho: JSON.stringify(desp), reposiciones: null, estado: 'confirmada',
      cierre: JSON.stringify({ remanente: rem, merma: [{ productoId: 1, cantidad: Math.round(d / 9) }], efectivoContado: 15000 + pi * 2500 + ventas - qr + dif, qrTotal: qr, qrDestino: ps[3], cerradaAt: now - d * 86400e3 - 2 * 3600e3 }),
      confirmadaAt: now - d * 86400e3 - 3600e3, createdAt: now - d * 86400e3 - 11 * 3600e3,
    })
  }
}
// hoy: Marcos cerrada, Alejandra cerrada con faltante, Diego abierta + reposición
jornadas.push({ puestoId: 1, vendedorId: 1, fecha: hoy, fondoCaja: 20000, despacho: JSON.stringify([L(0,160),L(1,8),L(2,15),L(3,45),L(4,18),L(5,15)]), reposiciones: null, estado: 'cerrada', cierre: JSON.stringify({ remanente:[L(0,30),L(1,1),L(2,3),L(3,12),L(4,4),L(5,3)], merma:[L(0,4)], efectivoContado:0, qrTotal:0, qrDestino:'negocio', cerradaAt: now - 2*3600e3 }), confirmadaAt: null, createdAt: now - 12*3600e3 })
{ const j = jornadas[jornadas.length-1]; const c = JSON.parse(j.cierre); const vend=(i,r,m)=>(160 - 0, j.despacho && 0, (JSON.parse(j.despacho)[i].cantidad - r - m) * productos[i][2]); const ventas = vend(0,30,4)+vend(1,1,0)+vend(2,3,0)+vend(3,12,0)+vend(4,4,0)+vend(5,3,0); c.qrTotal = Math.round(ventas*0.35); c.efectivoContado = 20000 + ventas - c.qrTotal; j.cierre = JSON.stringify(c) }
jornadas.push({ puestoId: 2, vendedorId: 2, fecha: hoy, fondoCaja: 20000, despacho: JSON.stringify([L(0,140),L(1,6),L(2,12),L(3,40),L(4,15),L(5,12)]), reposiciones: null, estado: 'cerrada', cierre: JSON.stringify({ remanente:[L(0,25),L(1,1),L(2,2),L(3,10),L(4,3),L(5,2)], merma:[L(0,12),L(3,6)], efectivoContado:0, qrTotal:0, qrDestino:'negocio', cerradaAt: now - 3600e3 }), confirmadaAt: null, createdAt: now - 12*3600e3 })
{ const j = jornadas[jornadas.length-1]; const c = JSON.parse(j.cierre); const d = JSON.parse(j.despacho); const vend=(i,r,m)=>(d[i].cantidad - r - m) * productos[i][2]; const ventas = vend(0,25,12)+vend(1,1,0)+vend(2,2,0)+vend(3,10,6)+vend(4,3,0)+vend(5,2,0); c.qrTotal = Math.round(ventas*0.25); c.efectivoContado = 20000 + ventas - c.qrTotal - 16400; j.cierre = JSON.stringify(c) }
jornadas.push({ puestoId: 3, vendedorId: 3, fecha: hoy, fondoCaja: 15000, despacho: JSON.stringify([L(0,120),L(1,5),L(2,10),L(3,35),L(4,20),L(5,10)]), reposiciones: JSON.stringify([{ items:[L(0,30),L(3,10)], createdAt: now - 3*3600e3 }]), estado: 'abierta', cierre: null, confirmadaAt: null, createdAt: now - 10*3600e3 })

const ventasM = [
  { jornadaId: jid - 0, items: [L(0,10),L(4,1)], m: 'efectivo', h: 9 }, // placeholders ajustados abajo
]

const ins = (t, rows) => { const st = db.prepare(`INSERT INTO ${t} VALUES (${'?,'.repeat(rows[0].length).slice(0,-1)})`); rows.forEach(r => st.run(r)); st.free() }
ins('productos', productos); ins('puestos', puestos); ins('vendedores', vendedores)

// ids de jornadas y ventas de Marcos hoy
const jHoyMarcos = jornadas.length - 2
jornadas.forEach((j, i) => ins('jornadas', [[i+1, j.puestoId, j.vendedorId, j.fecha, j.fondoCaja, j.despacho, j.reposiciones, j.estado, j.cierre, j.confirmadaAt, j.createdAt]]))
const ventas = [
  [1, jHoyMarcos, JSON.stringify([L(0,12),L(4,1)]), 8100, 'efectivo', now - 9*3600e3],
  [2, jHoyMarcos, JSON.stringify([L(3,8)]), 4800, 'qr', now - 7*3600e3],
  [3, jHoyMarcos, JSON.stringify([L(0,6),L(5,2)]), 6900, 'efectivo', now - 4*3600e3],
]
ins('ventas', ventas)
ins('duenios', [[1, 'Patricio (demo)', 'duenio@demo.tupuesto', '0000', 0, 1, 0]])

writeFileSync('public/tupuesto.sqlite', Buffer.from(db.export()))
console.log('tupuesto.sqlite:', jornadas.length, 'jornadas,', ventas.length, 'ventas,', productos.length, 'productos')
