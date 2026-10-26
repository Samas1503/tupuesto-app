// POST /api/verify-reset — valida el código de 6 dígitos y cambia el PIN
// Body: { email, codigo, nuevoPin } — `entidad` (legacy) se acepta pero se ignora:
// ya no hay tablas separadas, todo usuario vive en `usuarios`.
// El PIN llega plano y se hashea acá server-side (SHA-256 → pin_hash).
// Código: vigente ≤15min, un solo uso, máx. MAX_INTENTOS intentos (A4 —
// brute-force): cada intento fallido suma `intentos` y al 5to quema el código.
// Respuesta genérica siempre: no se revela si el email existe ni si el
// código era válido. Env: DATABASE_URL
import { hashPin } from './_lib/pin.js'
import { neon } from '@neondatabase/serverless'
import { createHash } from 'node:crypto'

const MAX_INTENTOS = 5

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL no configurada' })

  const { email, codigo, nuevoPin } = req.body ?? {} // entidad legacy ignorada
  const emailNorm = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const codigoNorm = typeof codigo === 'string' ? codigo.trim() : ''
  const pinNorm = typeof nuevoPin === 'string' ? nuevoPin.trim() : ''

  if (emailNorm === '') return res.status(400).json({ error: 'email requerido' })
  if (!/^\d{6}$/.test(codigoNorm)) return res.status(400).json({ error: 'código inválido' })
  if (!/^\d{4,8}$/.test(pinNorm)) return res.status(400).json({ error: 'PIN nuevo inválido (4-8 dígitos)' })

  const generico = () => res.status(400).json({ error: 'código inválido o vencido' })

  const sql = neon(process.env.DATABASE_URL)
  const users = await sql.query(
    `SELECT id FROM usuarios WHERE lower(email) = $1 AND eliminado IS NOT TRUE LIMIT 1`,
    [emailNorm],
  )
  const user = users[0]
  if (!user) return generico()

  // último código vigente del usuario — es el objetivo del intento: aunque el
  // código ingresado no coincida, el intento se cuenta sobre esta fila
  const rows = await sql.query(
    `SELECT id, codigo FROM codigos_reset
     WHERE entidad = 'usuarios' AND usuario_id = $1
       AND usado = FALSE AND expires_at >= $2
     ORDER BY id DESC LIMIT 1`,
    [user.id, Date.now()],
  )
  const row = rows[0]
  if (!row) return generico()

  if (row.codigo !== codigoNorm) {
    // intento fallido — contar y quemar al llegar a MAX_INTENTOS.
    // Si la columna `intentos` todavía no existe (migrate pendiente) se degrada
    // a no contar: la respuesta genérica es la misma.
    try {
      await sql.query(
        `UPDATE codigos_reset
           SET intentos = intentos + 1,
               usado = CASE WHEN intentos + 1 >= $2 THEN TRUE ELSE usado END
         WHERE id = $1`,
        [row.id, MAX_INTENTOS],
      )
    } catch (e) {
      console.error('verify-reset: no se pudo registrar intento fallido:', e?.message ?? e)
    }
    return generico()
  }

  // consumo atómico — un solo request puede pasar de acá (race-safe)
  const consumed = await sql.query(
    `UPDATE codigos_reset SET usado = TRUE WHERE id = $1 AND usado = FALSE RETURNING id`,
    [row.id],
  )
  if (!consumed.length) return res.status(409).json({ error: 'código inválido o vencido' })

  const pinHash = hashPin(pinNorm)
  await sql.query(`UPDATE usuarios SET pin_hash = $1, debe_cambiar_pin = FALSE WHERE id = $2`, [pinHash, user.id])
  return res.status(200).json({ ok: true })
}
