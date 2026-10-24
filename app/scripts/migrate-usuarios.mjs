// Migración T01 — tabla `usuarios` unificada (admin + duenios + vendedores)
// Corre con node directo contra Neon (no via Vercel):
//
//   node app/scripts/migrate-usuarios.mjs        (desde la raíz del repo)
//
// DATABASE_URL la toma de process.env o del .env raíz (gitignored — el secret
// nunca se commitea).
//
// Qué hace (idempotente — se puede correr N veces):
//   1. CREATE TABLE IF NOT EXISTS usuarios (rol, pin_hash SHA-256, duenio_id,
//      categoria, flags debe_cambiar_pin/activo/eliminado).
//   2. duenios  → usuarios rol='duenio'  (mismo id — puestos/productos/jornadas
//      cuelgan de duenio_id) con categoria='comida' (default demo).
//   3. vendedores → usuarios rol='vendedor' (ids NUEVOS por serial — los viejos
//      colisionan con los de duenios). duenio_id = su dueño.
//   4. pin (texto plano) → pin_hash = sha256 hex.
//   5. Admin demo: rol='admin', admin@demo.tupuesto, pin '0000'.
//   6. Remap de FKs que apuntaban a vendedores.id → nuevo usuarios.id:
//      codigos_reset.usuario_id (entidad='vendedores'), jornadas.vendedor_id,
//      solicitudes.vendedor_id / solicitado_por.
//      codigos_reset.usuario_id con entidad='duenios' queda igual (id preservado).
//   Las tablas duenios/vendedores NO se borran — quedan como backup.

import { neon } from '@neondatabase/serverless'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

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
const sql = neon(DATABASE_URL)
const sha256 = (s) => createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex')

/* ── 1. schema ────────────────────────────────────────────────── */
await sql.query(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id                SERIAL PRIMARY KEY,
    rol               TEXT NOT NULL CHECK (rol IN ('admin', 'duenio', 'vendedor')),
    nombre            TEXT,
    email             TEXT UNIQUE,
    pin_hash          TEXT,
    debe_cambiar_pin  BOOLEAN NOT NULL DEFAULT FALSE,
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    eliminado         BOOLEAN NOT NULL DEFAULT FALSE,
    duenio_id         INTEGER,
    categoria         TEXT CHECK (categoria IN ('comida','postres','ropa','mercaderia','juguetes','otro'))
  )
`)
console.log('tabla usuarios: OK')

/* ── upsert por email (natural key) — preserva id si viene y está libre ── */
async function upsertUsuario(u) {
  const email = String(u.email ?? '').trim().toLowerCase()
  if (!email) return null
  const pinHash = sha256(u.pin)
  const existing = await sql.query('SELECT id FROM usuarios WHERE lower(email) = $1 LIMIT 1', [email])
  if (existing[0]) {
    await sql.query(
      `UPDATE usuarios SET rol=$2, nombre=$3, pin_hash=$4, debe_cambiar_pin=$5,
         activo=$6, eliminado=$7, duenio_id=$8, categoria=$9 WHERE id=$1`,
      [existing[0].id, u.rol, u.nombre, pinHash, !!u.debe_cambiar_pin,
       !!u.activo, !!u.eliminado, u.duenio_id ?? null, u.categoria ?? null],
    )
    return existing[0].id
  }
  const cols = 'rol, nombre, email, pin_hash, debe_cambiar_pin, activo, eliminado, duenio_id, categoria'
  const vals = [u.rol, u.nombre, email, pinHash, !!u.debe_cambiar_pin, !!u.activo, !!u.eliminado, u.duenio_id ?? null, u.categoria ?? null]
  // preservar el id original si está libre (duenios lo necesitan: puestos/productos/etc. cuelgan de duenio_id)
  if (u.id != null) {
    const taken = await sql.query('SELECT 1 FROM usuarios WHERE id = $1', [u.id])
    if (!taken.length) {
      const r = await sql.query(
        `INSERT INTO usuarios (id, ${cols}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [u.id, ...vals],
      )
      return r[0].id
    }
  }
  const r = await sql.query(
    `INSERT INTO usuarios (${cols}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    vals,
  )
  return r[0].id
}

/* ── 2. duenios → usuarios (rol='duenio', categoria='comida', mismo id) ── */
const duenios = await sql.query('SELECT * FROM duenios')
const mapDuenio = {} // viejo id → nuevo id (debería ser identidad)
for (const d of duenios) {
  const newId = await upsertUsuario({ ...d, rol: 'duenio', categoria: 'comida', duenio_id: null })
  if (newId != null) mapDuenio[d.id] = newId
}
// el serial quedó atrás de los ids explícitos → re-sincronizar
await sql.query(`SELECT setval(pg_get_serial_sequence('usuarios','id'), (SELECT COALESCE(MAX(id),1) FROM usuarios))`)
console.log(`duenios → usuarios: ${Object.keys(mapDuenio).length} (ids preservados)`)

/* ── 3. vendedores → usuarios (rol='vendedor', ids nuevos por serial) ──── */
const vendedores = await sql.query('SELECT * FROM vendedores ORDER BY id')
const mapVend = {} // viejo vendedores.id → nuevo usuarios.id
for (const v of vendedores) {
  const newId = await upsertUsuario({
    ...v, rol: 'vendedor', categoria: null,
    duenio_id: mapDuenio[v.duenio_id] ?? v.duenio_id ?? null,
    id: null, // el id viejo puede colisionar con un duenio → serial asigna
  })
  if (newId != null) mapVend[v.id] = newId
}
console.log(`vendedores → usuarios: ${Object.keys(mapVend).length} (mapa ${JSON.stringify(mapVend)})`)

/* ── 4. admin demo ────────────────────────────────────────────── */
const adminId = await upsertUsuario({
  rol: 'admin', nombre: 'Admin', email: 'admin@demo.tupuesto', pin: '0000',
  debe_cambiar_pin: false, activo: true, eliminado: false,
})
console.log(`admin demo: id=${adminId} (admin@demo.tupuesto / pin 0000)`)

/* ── 5. remap FKs vendedores.id → usuarios.id ─────────────────── */
// codigos_reset.usuario_id ya apunta a usuarios.id: los de entidad='vendedores'
// hay que mapearlos al id nuevo; los de 'duenios' quedan (id preservado).
// UPDATE … FROM (VALUES…) es UNA sola sentencia por columna — el join se evalúa
// contra los valores pre-update, así no hay cascada si un id nuevo coincide
// con otro id viejo del mapa.
const pairs = Object.entries(mapVend)
  .filter(([oldId, newId]) => Number(oldId) !== newId)
  .map(([oldId, newId]) => `(${Number(oldId)},${newId})`)
if (pairs.length) {
  const m = `(VALUES ${pairs.join(',')}) AS m(viejo, nuevo)`
  await sql.query(`UPDATE codigos_reset c SET usuario_id = m.nuevo FROM ${m} WHERE c.entidad = 'vendedores' AND c.usuario_id = m.viejo`)
  await sql.query(`UPDATE jornadas j SET vendedor_id = m.nuevo FROM ${m} WHERE j.vendedor_id = m.viejo`)
  await sql.query(`UPDATE solicitudes s SET vendedor_id = m.nuevo FROM ${m} WHERE s.vendedor_id = m.viejo`)
  await sql.query(`UPDATE solicitudes s SET solicitado_por = m.nuevo FROM ${m} WHERE s.solicitado_por = m.viejo`)
}
console.log(`FKs remapeadas (codigos_reset/jornadas/solicitudes): ${pairs.length} ids de vendedor`)

/* ── resumen ──────────────────────────────────────────────────── */
const counts = await sql.query(`SELECT rol, COUNT(*)::int n FROM usuarios GROUP BY rol ORDER BY rol`)
console.log('usuarios por rol:', JSON.stringify(counts))
console.log('migración usuarios lista ✔')
