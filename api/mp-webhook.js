// POST /api/mp-webhook — notificación de Mercado Pago por cada pago
// Env: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET (opcional — firma x-signature),
//      DATABASE_URL (opcional — idempotencia mp_webhooks_procesados),
//      NOTIFY_URL (opcional — ej. Google Apps Script o
//      https://api.callmebot.com/whatsapp.php?phone=5493884558285&apikey=TU_KEY&text=)
//
// Flujo: MP avisa type=payment → verificamos la firma si hay secret →
// consultamos el pago (re-fetch — el body de MP no es confianza suficiente) →
// si está aprobado y no se procesó antes (idempotencia por payment_id),
// disparamos NOTIFY_URL con {text} reemplazando %TEXTO% (o POST JSON si la
// URL no tiene placeholder).
import { neon } from '@neondatabase/serverless'
import { createHmac, timingSafeEqual } from 'node:crypto'

// x-signature de MP: "ts=<ts>,v1=<hmac>" donde v1 = HMAC-SHA256(secret,
// "id:<data.id>;request-id:<x-request-id>;ts:<ts>;")
function firmaValida(req, paymentId, secret) {
  const header = String(req.headers['x-signature'] ?? '')
  const ts = /(?:^|,)ts=([^,]+)/.exec(header)?.[1]
  const v1 = /(?:^|,)v1=([^,]+)/.exec(header)?.[1]
  if (!ts || !v1) return false
  const reqId = String(req.headers['x-request-id'] ?? '')
  const esperado = createHmac('sha256', secret)
    .update(`id:${paymentId};request-id:${reqId};ts:${ts};`)
    .digest('hex')
  return v1.length === esperado.length
      && timingSafeEqual(Buffer.from(v1, 'utf8'), Buffer.from(esperado, 'utf8'))
}

export default async function handler(req, res) {
  // MP puede mandar el evento por body o por query
  const type = req.body?.type ?? req.query?.type
  const paymentId = req.body?.data?.id ?? req.query?.['data.id']

  if (type !== 'payment' || !paymentId) {
    return res.status(200).json({ ignored: true })
  }

  // ── verificación de firma (M5) ──
  const secret = process.env.MP_WEBHOOK_SECRET
  if (secret) {
    if (!firmaValida(req, paymentId, secret)) {
      return res.status(401).json({ error: 'firma inválida' })
    }
  } else {
    // sin secret no se puede verificar origen — el re-fetch del pago a la API
    // de MP sigue siendo la mitigación principal (un payment_id inventado no
    // devuelve un pago aprobado)
    console.warn('mp-webhook: MP_WEBHOOK_SECRET no configurada — notificación sin verificación de firma')
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

  // ── idempotencia: cada payment_id se procesa una sola vez (M5) ──
  // MP reintenta la notificación; sin esta marca cada retry dispara NOTIFY_URL
  // de nuevo. Si la tabla no existe (migrate pendiente) se degrada a procesar.
  if (process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL)
      const ins = await sql.query(
        `INSERT INTO mp_webhooks_procesados (payment_id, created_at)
         VALUES ($1, $2) ON CONFLICT (payment_id) DO NOTHING
         RETURNING payment_id`,
        [Number(payment.id), Date.now()],
      )
      if (!ins.length) {
        return res.status(200).json({ ok: true, duplicado: true, payment_id: payment.id })
      }
    } catch (e) {
      console.error('mp-webhook: idempotencia no disponible:', e?.message ?? e)
    }
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
