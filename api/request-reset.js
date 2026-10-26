// POST /api/request-reset — pide un código de 6 dígitos para resetear el PIN
// Body: { email } — `entidad` se acepta por compatibilidad pero se ignora
// (ya no hay duenios/vendedores separadas: una sola tabla `usuarios`).
// Siempre responde 200 genérico (no filtra si el email existe).
// Env: DATABASE_URL, RESEND_API_KEY, FROM_EMAIL (opcional)
import { neon } from '@neondatabase/serverless'
import { applyCors } from './_lib/cors.js'
import { randomInt } from 'node:crypto'
import { emailHtml } from './email-template.js'

const EXPIRA_MS = 15 * 60 * 1000 // 15 minutos

export default async function handler(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL no configurada' })
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' })

  const { email } = req.body ?? {} // `entidad` ignorado a propósito
  const emailNorm = typeof email === 'string' ? email.trim().toLowerCase() : ''
  // Respuesta genérica — no revelar si el email existe ni si el envío falló
  const generico = () => res.status(200).json({ ok: true })
  if (emailNorm === '') return generico()

  const sql = neon(process.env.DATABASE_URL)
  try {
    const users = await sql.query(
      `SELECT * FROM usuarios WHERE lower(email) = $1 AND activo AND NOT eliminado LIMIT 1`,
      [emailNorm],
    )
    const user = users[0]
    if (!user) return generico()

    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const ahora = Date.now()
    // A4 — un solo código vigente por usuario: los anteriores quedan quemados
    await sql.query(
      `UPDATE codigos_reset SET usado = TRUE
       WHERE usuario_id = $1 AND entidad = 'usuarios' AND usado = FALSE`,
      [user.id],
    )
    await sql.query(
      `INSERT INTO codigos_reset (entidad, usuario_id, codigo, expires_at, usado, created_at)
       VALUES ($1, $2, $3, $4, FALSE, $5)`,
      ['usuarios', user.id, codigo, ahora + EXPIRA_MS, ahora],
    )

    const from = process.env.FROM_EMAIL ?? 'TuPuesto <onboarding@resend.dev>'
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [emailNorm],
        subject: 'Tu código TuPuesto',
        html: emailHtml({
          categoria: user.categoria ?? 'otro',
          nombre: user.nombre,
          intro: 'Pediste recuperar tu PIN de <b>TuPuesto</b>. Tu código es:',
          codigo,
          codigoPie: 'Vence en <b>15 minutos</b> y es de un solo uso.',
          nota: 'Si no pediste este código, ignorá este email — tu PIN no cambia.',
        }),
      }),
    })
    if (!r.ok) console.error('request-reset: resend error', r.status, await r.text())
  } catch (e) {
    console.error('request-reset:', e)
  }
  return generico()
}
