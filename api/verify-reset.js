// POST /api/verify-reset — valida el código de 6 dígitos y cambia el PIN
// Body: { entidad: 'vendedores'|'duenios', email, codigo, nuevoPin }
// Código: vigente ≤15min, un solo uso. Env: DATABASE_URL
import { neon } from '@neondatabase/serverless'

const ENTIDADES = new Set(['vendedores', 'duenios'])

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL no configurada' })

  const { entidad, email, codigo, nuevoPin } = req.body ?? {}
  const emailNorm = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const codigoNorm = typeof codigo === 'string' ? codigo.trim() : ''
  const pinNorm = typeof nuevoPin === 'string' ? nuevoPin.trim() : ''

  if (!ENTIDADES.has(entidad)) return res.status(400).json({ error: 'entidad inválida' })
  if (emailNorm === '') return res.status(400).json({ error: 'email requerido' })
  if (!/^\d{6}$/.test(codigoNorm)) return res.status(400).json({ error: 'código inválido' })
  if (!/^\d{4,8}$/.test(pinNorm)) return res.status(400).json({ error: 'PIN nuevo inválido (4-8 dígitos)' })

  const sql = neon(process.env.DATABASE_URL)
  // entidad viene de whitelist cerrada → seguro interpolar el nombre de tabla
  const users = await sql.query(
    `SELECT id FROM ${entidad} WHERE lower(email) = $1 AND eliminado IS NOT TRUE LIMIT 1`,
    [emailNorm],
  )
  const user = users[0]
  if (!user) return res.status(400).json({ error: 'código inválido o vencido' })

  const rows = await sql.query(
    `SELECT id FROM codigos_reset
     WHERE entidad = $1 AND usuario_id = $2 AND codigo = $3
       AND usado = FALSE AND expires_at >= $4
     ORDER BY id DESC LIMIT 1`,
    [entidad, user.id, codigoNorm, Date.now()],
  )
  const row = rows[0]
  if (!row) return res.status(400).json({ error: 'código inválido o vencido' })

  await sql.query(`UPDATE ${entidad} SET pin = $1, debe_cambiar_pin = FALSE WHERE id = $2`, [pinNorm, user.id])
  await sql.query(`UPDATE codigos_reset SET usado = TRUE WHERE id = $1`, [row.id])
  return res.status(200).json({ ok: true })
}
