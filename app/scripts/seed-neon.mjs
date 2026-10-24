// Seed de Neon con la data demo — lee public/tupuesto.sqlite (la MISMA fuente
// que hidrata Dexie, generada por gen-sqlite.mjs) e inserta en Postgres con
// conexión directa via @neondatabase/serverless.
//
// Uso:  node app/scripts/seed-neon.mjs        (desde la raíz del repo)
//       DATABASE_URL=... node seed-neon.mjs   (o la toma del .env raíz)
//
// Mapeo camelCase/sqlite → snake_case/Neon:
//   jornadas:    puesto_id, vendedor_id, fondo_caja, confirmada_at, created_at
//                (despacho/reposiciones/saldo_inicial/descarte/cierre → jsonb)
//   ventas:      jornada_id, metodo_pago, created_at, items → jsonb
//   productos:   precio_costo, duenio_id
//   vendedores:  debe_cambiar_pin, duenio_id, eliminado (sqlite no tiene puesto_id en Neon)
//   puestos:     duenio_id (qrDestinoDefault no tiene columna — vive dentro de cierre.qrDestino)
//   solicitudes: duenio_id, vendedor_id, solicitado_por, jornada_id, created_at, resuelta_at
//
// NOTA: el .env raíz queda fuera del repo (gitignored) — el secret nunca se commitea.

import initSqlJs from 'sql.js'
import { neon } from '@neondatabase/serverless'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = fileURLToPath(new URL('.', import.meta.url))
const APP_DIR = fileURLToPath(new URL('..', import.meta.url))
const SQLITE_PATH = new URL('../public/tupuesto.sqlite', import.meta.url)
const ENV_PATH = new URL('../../.env', import.meta.url)

/* ── env: DATABASE_URL de process.env o del .env raíz ─────────── */
function loadEnv() {
  if (!existsSync(ENV_PATH)) return
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const s = line.trim()
    if (!s || s.startsWith('#') || !s.includes('=')) continue
    const i = s.indexOf('=')
    const k = s.slice(0, i).trim()
    const v = s.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnv()
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL — configurarla en el .env raíz o exportarla.')
  process.exit(1)
}

/* ── leer la data demo desde el sqlite (fallback: regenerarlo) ── */
if (!existsSync(SQLITE_PATH)) {
  console.log('tupuesto.sqlite no existe — corriendo gen-sqlite.mjs primero…')
  execSync('node scripts/gen-sqlite.mjs', { cwd: APP_DIR, stdio: 'inherit' })
}
const SQL = await initSqlJs()
const sq = new SQL.Database(readFileSync(SQLITE_PATH))

const rows = (q) => {
  const rs = sq.exec(q)
  if (!rs.length) return []
  return rs[0].values.map(row => Object.fromEntries(rs[0].columns.map((c, i) => [c, row[i]])))
}
const J = (v) => (v ? JSON.parse(v) : null) // TEXT json → objeto (jsonb en Neon)
const DUENIO = 1 // demo single-tenant: todo cuelga del dueño id=1

/* ── mapeo a snake_case ───────────────────────────────────────── */
const seed = {
  duenios: rows('SELECT * FROM duenios').map(r => ({
    id: r.id, nombre: r.nombre, email: r.email, pin: r.pin,
    debe_cambiar_pin: !!r.debeCambiarPin, activo: !!r.activo, eliminado: !!r.eliminado,
  })),
  vendedores: rows('SELECT * FROM vendedores').map(r => ({
    id: r.id, duenio_id: DUENIO, nombre: r.nombre, email: r.email, pin: r.pin,
    debe_cambiar_pin: !!r.debeCambiarPin, activo: !!r.activo, eliminado: false,
  })),
  puestos: rows('SELECT * FROM puestos').map(r => ({
    id: r.id, duenio_id: DUENIO, nombre: r.nombre, ubicacion: r.ubicacion, activo: !!r.activo,
  })),
  productos: rows('SELECT * FROM productos').map(r => ({
    id: r.id, duenio_id: DUENIO, nombre: r.nombre, precio: r.precio,
    precio_costo: r.precioCosto, ingredientes: r.ingredientes, imagen: r.imagen,
    orden: r.orden, activo: !!r.activo,
  })),
  jornadas: rows('SELECT * FROM jornadas').map(r => ({
    id: r.id, duenio_id: DUENIO, puesto_id: r.puestoId, vendedor_id: r.vendedorId,
    fecha: r.fecha, fondo_caja: r.fondoCaja,
    despacho: J(r.despacho), reposiciones: J(r.reposiciones),
    saldo_inicial: null, descarte: null, hora_fin: null, cierre_anticipado_ok: null,
    estado: r.estado, cierre: J(r.cierre),
    confirmada_at: r.confirmadaAt, created_at: r.createdAt,
  })),
  ventas: rows('SELECT * FROM ventas').map(r => ({
    id: r.id, jornada_id: r.jornadaId, items: J(r.items), total: r.total,
    metodo_pago: r.metodoPago, created_at: r.createdAt,
  })),
  // el sqlite no trae solicitudes — una demo coherente: Diego (jornada abierta
  // hoy) pide cierre anticipado. jornada_id = la última jornada (la abierta).
  solicitudes: [
    {
      id: 1, duenio_id: DUENIO, tipo: 'cierre-anticipado',
      vendedor_id: 3, solicitado_por: 3,
      jornada_id: rows('SELECT MAX(id) m FROM jornadas')[0]?.m ?? null,
      motivo: 'Me surgió un imprevisto, ¿puedo cerrar antes?', estado: 'pendiente',
      created_at: Date.now() - 3600e3, resuelta_at: null,
    },
  ],
}

/* ── insert con upsert por id ─────────────────────────────────── */
const JSONB = {
  jornadas: new Set(['despacho', 'reposiciones', 'saldo_inicial', 'descarte', 'cierre']),
  ventas: new Set(['items']),
}
const sql = neon(DATABASE_URL)

for (const [tabla, list] of Object.entries(seed)) {
  let n = 0
  for (const row of list) {
    const cols = Object.keys(row)
    const placeholders = cols.map((c, i) =>
      JSONB[tabla]?.has(c) ? `$${i + 1}::jsonb` : `$${i + 1}`)
    const vals = cols.map(c => {
      const v = row[c]
      return JSONB[tabla]?.has(c) && v != null ? JSON.stringify(v) : v
    })
    const sets = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')
    await sql.query(
      `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
       ON CONFLICT (id) DO UPDATE SET ${sets}`,
      vals,
    )
    n++
  }
  console.log(`${tabla}: ${n} filas`)
}
console.log('seed Neon listo —', Object.values(seed).reduce((a, l) => a + l.length, 0), 'filas totales')
