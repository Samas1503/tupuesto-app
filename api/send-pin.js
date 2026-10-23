// POST /api/send-pin — envía el acceso del vendedor por email vía Resend
// Body: { email, nombre, pin, appUrl }
// Env: RESEND_API_KEY (re.dashboard.resend.com), FROM_EMAIL (opcional)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const key = process.env.RESEND_API_KEY
  if (!key) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' })

  const { email, nombre, pin, appUrl } = req.body ?? {}
  if (!email || !pin) return res.status(400).json({ error: 'email y pin requeridos' })

  const from = process.env.FROM_EMAIL ?? 'TuPuesto <onboarding@resend.dev>'
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Tu acceso a TuPuesto',
      html: `
        <div style="font-family:sans-serif;max-width:420px;margin:auto">
          <h2 style="color:#0a2540">Hola ${nombre ?? 'vendedor'} 👋</h2>
          <p>Te crearon una cuenta en <b>TuPuesto</b>. Tu PIN de acceso es:</p>
          <p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#635bff;text-align:center;background:#f6f9fc;padding:16px;border-radius:12px">${pin}</p>
          <p>En el primer ingreso te va a pedir elegir tu propio PIN — este es de un solo uso.</p>
          <p style="text-align:center;margin:24px 0">
            <a href="${appUrl ?? 'https://app-ten-tan-35.vercel.app'}"
               style="background:#635bff;color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:700">
              Entrar a la app
            </a>
          </p>
          <p style="color:#6b7c93;font-size:12px">Si no esperabas este email, ignoralo.</p>
        </div>`,
    }),
  })
  const data = await r.json()
  if (!r.ok) return res.status(r.status).json({ error: data.message ?? 'resend error' })
  return res.status(200).json({ ok: true, id: data.id })
}
