// POST /api/send-pin — envía el acceso del usuario por email vía Resend
// Body: { email, nombre, pin, appUrl }
// El accent del email sale de la categoría: vendedor → categoría de su duenio
// (usuarios.duenio_id), duenio → su categoría, admin/otro → 'otro'.
// Env: RESEND_API_KEY (re.dashboard.resend.com), FROM_EMAIL (opcional),
//      DATABASE_URL (opcional — sin DB el accent cae en 'otro')
import { neon } from '@neondatabase/serverless'
import { emailHtml } from './email-template.js'

// Busca la categoría que define el accent del email para ese usuario.
async function categoriaPara(sql, emailNorm) {
  const users = await sql.query(
    `SELECT rol, duenio_id, categoria FROM usuarios
     WHERE lower(email) = $1 AND activo AND NOT eliminado LIMIT 1`,
    [emailNorm],
  )
  const user = users[0]
  if (!user) return 'otro'
  if (user.rol === 'duenio') return user.categoria ?? 'otro'
  if (user.rol === 'vendedor' && user.duenio_id != null) {
    const duenios = await sql.query(
      `SELECT categoria FROM usuarios WHERE id = $1 AND rol = 'duenio' LIMIT 1`,
      [user.duenio_id],
    )
    return duenios[0]?.categoria ?? 'otro'
  }
  return 'otro' // admin u otro rol
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const key = process.env.RESEND_API_KEY
  if (!key) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' })

  const { email, nombre, pin, appUrl } = req.body ?? {}
  if (!email || !pin) return res.status(400).json({ error: 'email y pin requeridos' })
  const emailNorm = typeof email === 'string' ? email.trim().toLowerCase() : ''

  // Accent por categoría — best-effort: si no hay DB o falla, usa 'otro'
  let categoria = 'otro'
  if (process.env.DATABASE_URL && emailNorm !== '') {
    try {
      categoria = await categoriaPara(neon(process.env.DATABASE_URL), emailNorm)
    } catch (e) {
      console.error('send-pin: lookup categoria', e)
    }
  }

  const from = process.env.FROM_EMAIL ?? 'TuPuesto <onboarding@resend.dev>'
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Tu PIN de acceso — TuPuesto',
      html: emailHtml({
        categoria,
        nombre: nombre ?? 'vendedor',
        intro: 'Te crearon una cuenta en <b>TuPuesto</b>. Tu PIN de acceso es:',
        codigo: pin,
        codigoPie: 'En el primer ingreso te va a pedir elegir tu propio PIN — este es de un solo uso.',
        ctaUrl: appUrl ?? 'https://app-ten-tan-35.vercel.app',
        ctaTexto: 'Entrar a la app',
        nota: 'Si no esperabas este email, ignoralo.',
      }),
    }),
  })
  const data = await r.json()
  if (!r.ok) return res.status(r.status).json({ error: data.message ?? 'resend error' })
  return res.status(200).json({ ok: true, id: data.id })
}
