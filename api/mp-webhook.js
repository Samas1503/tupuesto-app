// POST /api/mp-webhook — notificación de Mercado Pago por cada pago
// Env: MP_ACCESS_TOKEN, NOTIFY_URL (opcional — ej. Google Apps Script o
//      https://api.callmebot.com/whatsapp.php?phone=5493884558285&apikey=TU_KEY&text=)
//
// Flujo: MP avisa type=payment → consultamos el pago → si está aprobado,
// disparamos NOTIFY_URL con {text} reemplazando %TEXTO% (o POST JSON si la
// URL no tiene placeholder).

export default async function handler(req, res) {
  // MP puede mandar el evento por body o por query
  const type = req.body?.type ?? req.query?.type
  const paymentId = req.body?.data?.id ?? req.query?.['data.id']

  if (type !== 'payment' || !paymentId) {
    return res.status(200).json({ ignored: true })
  }

  const token = process.env.MP_ACCESS_TOKEN
  if (!token) return res.status(500).json({ error: 'MP_ACCESS_TOKEN no configurado' })

  const pRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const payment = await pRes.json()

  if (!pRes.ok || payment.status !== 'approved') {
    return res.status(200).json({ status: payment.status ?? 'fetch_error' })
  }

  const texto =
    `Nueva seña TuPuesto: $${payment.transaction_amount} ARS · ` +
    `lead=${payment.external_reference ?? 'sin-ref'} · ` +
    `${payment.payer?.first_name ?? ''} ${payment.payer?.last_name ?? ''}`.trim()

  const notifyUrl = process.env.NOTIFY_URL
  if (notifyUrl) {
    try {
      if (notifyUrl.includes('%TEXTO%')) {
        await fetch(notifyUrl.replace('%TEXTO%', encodeURIComponent(texto)))
      } else {
        await fetch(notifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evento: 'sena_pagada',
            monto: payment.transaction_amount,
            lead: payment.external_reference,
            pagador: `${payment.payer?.first_name ?? ''} ${payment.payer?.last_name ?? ''}`.trim(),
            email: payment.payer?.email,
            payment_id: payment.id,
          }),
        })
      }
    } catch (e) {
      // la notificación no es crítica — el pago ya se acreditó
      console.error('NOTIFY_URL falló:', e)
    }
  }

  return res.status(200).json({
    ok: true,
    lead: payment.external_reference,
    monto: payment.transaction_amount,
  })
}
