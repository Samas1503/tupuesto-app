// Migración contratos-firma (T01) — tablas `contratos` y `firma_eventos`.
// Corre con node directo contra Neon (no via Vercel):
//
//   node app/scripts/migrate-contratos.mjs        (desde la raíz del repo)
//
// DATABASE_URL la toma de process.env o del .env raíz (gitignored — el secret
// nunca se commitea).
//
// Qué hace (idempotente — se puede correr N veces):
//   1. CREATE TABLE IF NOT EXISTS contratos: datos del suscriptor (razón social,
//      CUIT, email = domicilio electrónico, plan, precio) en JSONB, token UUID
//      para el link público /app/firmar, estado borrador|enviado|firmado|anulado,
//      pdf BYTEA + pdf_hash SHA-256, cuerpo (texto canónico firmado — queda
//      fijado para que el paquete probatorio verifique igual aunque la
//      plantilla cambie), provider/envelope_id nullable (tier proveedor externo
//      futuro), anclaje_pendiente (fallback OpenTimestamps).
//   2. CREATE TABLE IF NOT EXISTS firma_eventos — audit trail APPEND-ONLY:
//      cada evento lleva prev_hash + event_hash = SHA-256(prev_hash|tipo|
//      stableJson(payload)|created_at). La cadena arranca en prev_hash = 64 ceros.
//   3. Trigger BEFORE UPDATE OR DELETE que aborta con excepción — enforce
//      append-only a nivel DB, no solo por convención de la app.
//   4. Índices (token, estado, contrato_id) todos IF NOT EXISTS.
//   5. W4 (hardening): UNIQUE (contrato_id, prev_hash) en firma_eventos —
//      una cadena no puede bifurcarse; columna codigos_reset.intentos para
//      el contador anti brute-force de OTP; tabla mp_webhooks_procesados
//      para idempotencia del webhook de Mercado Pago.
//
// Verificación de la cadena: node app/scripts/verify-firma-chain.mjs [contrato_id]

import { neon } from '@neondatabase/serverless'
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

/* ── 1. contratos ─────────────────────────────────────────────── */
await sql.query(`
  CREATE TABLE IF NOT EXISTS contratos (
    id                SERIAL PRIMARY KEY,
    token             UUID NOT NULL DEFAULT gen_random_uuid(),
    duenio_id         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    plantilla_version TEXT NOT NULL DEFAULT 'contrato-v1',
    datos             JSONB NOT NULL DEFAULT '{}'::jsonb,
    cuerpo            TEXT,
    estado            TEXT NOT NULL DEFAULT 'borrador'
                      CHECK (estado IN ('borrador','enviado','firmado','anulado')),
    pdf               BYTEA,
    pdf_hash          TEXT,
    firma_dataurl     TEXT,
    anclaje_pendiente BOOLEAN NOT NULL DEFAULT FALSE,
    provider          TEXT,
    envelope_id       TEXT,
    created_at        BIGINT NOT NULL,
    enviado_at        BIGINT,
    firmado_at        BIGINT
  )
`)
// evolución idempotente por columna (por si la tabla ya existía con menos)
const COLS = [
  ['token',             `UUID DEFAULT gen_random_uuid()`],
  ['duenio_id',         `INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`],
  ['plantilla_version', `TEXT NOT NULL DEFAULT 'contrato-v1'`],
  ['datos',             `JSONB NOT NULL DEFAULT '{}'::jsonb`],
  ['cuerpo',            `TEXT`],
  ['estado',            `TEXT NOT NULL DEFAULT 'borrador'`],
  ['pdf',               `BYTEA`],
  ['pdf_hash',          `TEXT`],
  ['firma_dataurl',     `TEXT`],
  ['anclaje_pendiente', `BOOLEAN NOT NULL DEFAULT FALSE`],
  ['provider',          `TEXT`],
  ['envelope_id',       `TEXT`],
  ['created_at',        `BIGINT`],
  ['enviado_at',        `BIGINT`],
  ['firmado_at',        `BIGINT`],
]
for (const [col, def] of COLS) {
  await sql.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS ${col} ${def}`)
}
await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS contratos_token_uidx ON contratos (token)`)
await sql.query(`CREATE INDEX IF NOT EXISTS contratos_estado_idx ON contratos (estado)`)
await sql.query(`CREATE INDEX IF NOT EXISTS contratos_duenio_idx ON contratos (duenio_id)`)
console.log('tabla contratos: OK')

/* ── 2. firma_eventos (append-only, hash-chain) ───────────────── */
await sql.query(`
  CREATE TABLE IF NOT EXISTS firma_eventos (
    id          BIGSERIAL PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id),
    tipo        TEXT NOT NULL CHECK (tipo IN (
                  'solicitud','otp_enviado','otp_validado','documento_visto',
                  'trazo_capturado','aceptado','anclado','copia_entregada',
                  'exportado','anulado')),
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    prev_hash   TEXT NOT NULL,
    event_hash  TEXT NOT NULL UNIQUE,
    created_at  BIGINT NOT NULL
  )
`)
await sql.query(`CREATE INDEX IF NOT EXISTS firma_eventos_contrato_idx ON firma_eventos (contrato_id, id)`)
// W4/M4 — una cadena sana usa cada prev_hash UNA vez por contrato: el índice
// UNIQUE convierte cualquier bifurcación residual en error (appendEvento lo
// detecta y reintenta). Si ya existen forks de races viejas, el CREATE falla
// y el SELECT previo muestra las puntas conflictivas para resolverlas a mano.
const forks = await sql.query(
  `SELECT contrato_id, prev_hash, COUNT(*)::int n
   FROM firma_eventos GROUP BY contrato_id, prev_hash HAVING COUNT(*) > 1`,
)
if (forks.length) {
  console.error('ATENCIÓN — bifurcaciones preexistentes en firma_eventos (resolver antes de crear el UNIQUE):')
  for (const f of forks) console.error(`  contrato ${f.contrato_id}: ${f.n} eventos con prev_hash ${String(f.prev_hash).slice(0, 16)}…`)
  process.exit(1)
}
await sql.query(`CREATE UNIQUE INDEX IF NOT EXISTS firma_eventos_prev_hash ON firma_eventos (contrato_id, prev_hash)`)
console.log('tabla firma_eventos: OK')

/* ── 3. enforce append-only a nivel DB ────────────────────────── */
await sql.query(`
  CREATE OR REPLACE FUNCTION firma_eventos_no_update() RETURNS trigger AS $$
  BEGIN
    RAISE EXCEPTION 'firma_eventos es append-only — el audit trail legal no admite UPDATE/DELETE';
    RETURN NULL;
  END;
  $$ LANGUAGE plpgsql
`)
await sql.query(`DROP TRIGGER IF EXISTS firma_eventos_append_only ON firma_eventos`)
await sql.query(`
  CREATE TRIGGER firma_eventos_append_only
    BEFORE UPDATE OR DELETE ON firma_eventos
    FOR EACH ROW EXECUTE FUNCTION firma_eventos_no_update()
`)
console.log('trigger append-only: OK')

/* ── 4. hardening W4 ──────────────────────────────────────────── */
// A4 — contador de intentos fallidos en codigos_reset (OTP anti brute-force).
// La tabla la crea la migración de usuarios; IF EXISTS la tolera ausente.
await sql.query(`ALTER TABLE IF EXISTS codigos_reset ADD COLUMN IF NOT EXISTS intentos INT NOT NULL DEFAULT 0`)
console.log('codigos_reset.intentos: OK')

// M5 — idempotencia del webhook de Mercado Pago: un payment_id se procesa
// una sola vez aunque MP reintente la notificación.
await sql.query(`
  CREATE TABLE IF NOT EXISTS mp_webhooks_procesados (
    payment_id  BIGINT PRIMARY KEY,
    created_at  BIGINT NOT NULL
  )
`)
console.log('tabla mp_webhooks_procesados: OK')

/* ── resumen ──────────────────────────────────────────────────── */
const nContratos = await sql.query(`SELECT COUNT(*)::int n FROM contratos`)
const nEventos = await sql.query(`SELECT COUNT(*)::int n FROM firma_eventos`)
console.log(`contratos: ${nContratos[0].n} filas — firma_eventos: ${nEventos[0].n} filas`)
console.log('migración contratos lista ✔')
