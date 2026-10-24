// POST /api/request-reset — pide un código de 6 dígitos para resetear el PIN
// Body: { entidad: 'vendedores'|'duenios', email }
// Siempre responde 200 genérico (no filtra si el email existe).
// Env: DATABASE_URL, RESEND_API_KEY, FROM_EMAIL (opcional)
import { neon } from '@neondatabase/serverless'
import { randomInt } from 'node:crypto'

const ENTIDADES = new Set(['vendedores', 'duenios'])
const EXPIRA_MS = 15 * 60 * 1000 // 15 minutos

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL no configurada' })
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' })

  const { entidad, email } = req.body ?? {}
  const emailNorm = typeof email === 'string' ? email.trim().toLowerCase() : ''
  // Respuesta genérica — no revelar si el email existe ni si el envío falló
  const generico = () => res.status(200).json({ ok: true })
  if (!ENTIDADES.has(entidad) || emailNorm === '') return generico()

  const sql = neon(process.env.DATABASE_URL)
  try {
    // entidad viene de whitelist cerrada → seguro interpolar el nombre de tabla
    const users = await sql.query(
      `SELECT id, nombre FROM ${entidad} WHERE lower(email) = $1 AND eliminado IS NOT TRUE LIMIT 1`,
      [emailNorm],
    )
    const user = users[0]
    if (!user) return generico()

    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const ahora = Date.now()
    await sql.query(
      `INSERT INTO codigos_reset (entidad, usuario_id, codigo, expires_at, usado, created_at)
       VALUES ($1, $2, $3, $4, FALSE, $5)`,
      [entidad, user.id, codigo, ahora + EXPIRA_MS, ahora],
    )

    const from = process.env.FROM_EMAIL ?? 'TuPuesto <onboarding@resend.dev>'
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [emailNorm],
        subject: 'Tu código para recuperar el PIN de TuPuesto',
        html: `
          <div style="font-family:sans-serif;max-width:420px;margin:auto">
            <h2 style="color:#0a2540">Hola ${user.nombre ?? ''} 👋</h2>
            <p>Pediste recuperar tu PIN de <b>TuPuesto</b>. Tu código es:</p>
            <p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#635bff;text-align:center;background:#f6f9fc;padding:16px;border-radius:12px">${codigo}</p>
            <p>Vence en <b>15 minutos</b> y es de un solo uso.</p>
            <p style="color:#6b7c93;font-size:12px">Si no pediste este código, ignorá este email — tu PIN no cambia.</p>
          </div>`,
      }),
    })
    if (!r.ok) console.error('request-reset: resend error', r.status, await r.text())
  } catch (e) {
    console.error('request-reset:', e)
  }
  return generico()
}
