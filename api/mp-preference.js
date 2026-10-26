// POST /api/mp-preference — crea un link de pago único por lead (seña $13.000)
// Env: MP_ACCESS_TOKEN, BASE_URL (ej. https://tupuesto.vercel.app)
//
// Body JSON: { "leadId": "opcional", "nombre": "opcional" }
// Respuesta: { "init_point": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=..." }

export default async function handler(req, res) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' })
  }

  const token = process.env.MP_ACCESS_TOKEN
  const base = (process.env.BASE_URL ?? '').replace(/\/$/, '')
  if (!token) return res.status(500).json({ error: 'MP_ACCESS_TOKEN no configurado' })
  if (!base) return res.status(500).json({ error: 'BASE_URL no configurado' })

  const { leadId, nombre } = req.body ?? {}
  // external_reference es público por diseño, pero se acota a 64 chars
  // alfanuméricos (con guion) — evita inyectar texto arbitrario en el pago
  const lead = typeof leadId === 'string' ? leadId.trim() : ''
  const ref = /^[a-zA-Z0-9-]{1,64}$/.test(lead) ? lead : `sena-${Date.now()}`

  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [
        {
          title: `TuPuesto — Reserva fundador${nombre ? ` (${nombre})` : ''}`,
          quantity: 1,
          unit_price: 13000,
          currency_id: 'ARS',
        },
      ],
      external_reference: ref,
      back_urls: {
        success: `${base}/?pago=ok`,
        pending: `${base}/?pago=pendiente`,
        failure: `${base}/?pago=fallo`,
      },
      auto_return: 'approved',
      notification_url: `${base}/api/mp-webhook`,
    }),
  })

  const data = await mpRes.json()
  if (!mpRes.ok) {
    return res.status(mpRes.status).json({ error: 'MP error', detail: data })
  }
  return res.status(200).json({ init_point: data.init_point, preference_id: data.id })
}
