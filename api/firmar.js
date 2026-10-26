// GET  /api/firmar?token=<uuid> — datos del contrato para render público
//   (el token UUID es la credencial — reemplaza al login en la página de firma)
//   → { ok, estado, datos, cuerpo, plantilla_version, firmado_at, anclaje_pendiente }
//
// POST /api/firmar — acciones del flujo de firma. Body: { token, paso, ... }
//   paso 'visto'  → marca documento_visto en el audit trail (el front lo llama
//                   al renderizar el contrato).
//   paso 'otp'    sin codigo → genera OTP de 6 dígitos (codigos_reset, entidad
//                  'firma_contrato', 15 min, igual que request-reset) y lo manda
//                  por Resend al domicilio electrónico. Invalida códigos previos.
//   paso 'otp'    con codigo → valida el OTP (NO lo consume: se consume
//                  atómicamente en 'firmar' para que un código = una firma).
//   paso 'firmar' {codigo, firma, acepta} → pipeline completo:
//                  consume OTP → PDF canónico (pdf-lib) → SHA-256 → eventos en
//                  hash-chain → anclaje OpenTimestamps (con fallback
//                  anclaje_pendiente, no bloquea) → copia PDF por Resend.
//   → { ok, estado:'firmado', pdf_hash, anclaje: 'ok'|'pendiente' }
//
// Env: DATABASE_URL, RESEND_API_KEY, FROM_EMAIL (opcional)
import { neon } from '@neondatabase/serverless'
import { randomInt } from 'node:crypto'
import { emailHtml } from './email-template.js'
import {
  ENTIDAD_OTP, OTP_EXPIRA_MS, OTP_REENVIO_MS, MAX_FIRMA_BYTES, MAX_FIRMA_PIXELS,
  appendEvento, anclarOts, buildContratoPdf, buscarOtpVigente, clientIp,
  clientUa, consumirOtp, cors, enviarEmail, imagenPixels,
  registrarIntentoOtpFallido, sha256hex, textoCanonico,
} from './firma-lib.js'

const FIRMA_RE = /^data:image\/(png|jpe?g);base64,[a-z0-9+/=\s]+$/i

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL no configurada' })
  const sql = neon(process.env.DATABASE_URL)

  /* ── GET: render del contrato por token ─────────────────────── */
  if (req.method === 'GET') {
    const token = String(req.query?.token ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(token)) return res.status(400).json({ error: 'token inválido' })
    const rows = await sql.query(
      `SELECT id, datos, estado, plantilla_version, cuerpo, created_at, firmado_at,
              anclaje_pendiente, pdf_hash FROM contratos WHERE token = $1 LIMIT 1`,
      [token],
    )
    const c = rows[0]
    if (!c) return res.status(404).json({ error: 'contrato no encontrado' })
    if (c.estado === 'anulado') return res.status(410).json({ error: 'contrato anulado' })
    // si ya se firmó, el cuerpo guardado es el que entró al PDF — si no, render
    const cuerpo = c.cuerpo ?? await textoCanonico(c)
    return res.json({
      ok: true, estado: c.estado, datos: c.datos, cuerpo,
      plantilla_version: c.plantilla_version,
      firmado_at: c.firmado_at, anclaje_pendiente: c.anclaje_pendiente, pdf_hash: c.pdf_hash,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const { token, paso, codigo, firma } = req.body ?? {}
  // T02 manda `aceptacion`/`aceptado` — se aceptan los tres nombres
  const acepta = req.body?.acepta ?? req.body?.aceptacion ?? req.body?.aceptado
  if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) {
    return res.status(400).json({ error: 'token inválido' })
  }
  const rows = await sql.query(`SELECT * FROM contratos WHERE token = $1 LIMIT 1`, [token])
  const contrato = rows[0]
  if (!contrato) return res.status(404).json({ error: 'contrato no encontrado' })
  if (contrato.estado === 'anulado') return res.status(410).json({ error: 'contrato anulado' })

  const ip = clientIp(req), ua = clientUa(req)
  const email = String(contrato.datos?.email ?? '').toLowerCase()

  /* ── paso 'visto' — audit del render ────────────────────────── */
  if (paso === 'visto') {
    await appendEvento(sql, contrato.id, 'documento_visto', { ip, ua })
    return res.json({ ok: true })
  }

  /* ── paso 'otp' — enviar o validar el código ────────────────── */
  if (paso === 'otp') {
    // validar (no consume — el consumo atómico pasa en 'firmar')
    if (codigo != null) {
      const codigoNorm = String(codigo).trim()
      if (!/^\d{6}$/.test(codigoNorm)) return res.status(400).json({ error: 'código inválido' })
      const otp = await buscarOtpVigente(sql, contrato.id, codigoNorm)
      if (!otp) {
        // A4 — cuenta el intento sobre el último código vigente; a los
        // MAX_INTENTOS_OTP fallidos lo quema. Respuesta genérica siempre.
        await registrarIntentoOtpFallido(sql, contrato.id)
        return res.status(400).json({ error: 'código inválido o vencido' })
      }
      await appendEvento(sql, contrato.id, 'otp_validado', { otp_id: otp.id, ip, ua })
      return res.json({ ok: true, validado: true })
    }

    // enviar: un solo código vigente por contrato — se invalidan los anteriores
    if (contrato.estado === 'firmado') return res.status(409).json({ error: 'el contrato ya está firmado' })
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY no configurada' })
    const ahora = Date.now()
    // cooldown de reenvío: no generar otro código si el último tiene <60s
    const ult = await sql.query(
      `SELECT created_at FROM codigos_reset
       WHERE entidad = $1 AND usuario_id = $2 ORDER BY id DESC LIMIT 1`,
      [ENTIDAD_OTP, contrato.id],
    )
    if (ult[0] && ahora - Number(ult[0].created_at) < OTP_REENVIO_MS) {
      return res.status(429).json({ error: 'esperá un minuto antes de pedir otro código' })
    }
    await sql.query(
      `UPDATE codigos_reset SET usado = TRUE
       WHERE entidad = $1 AND usuario_id = $2 AND usado = FALSE`,
      [ENTIDAD_OTP, contrato.id],
    )
    const nuevo = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const ins = await sql.query(
      `INSERT INTO codigos_reset (entidad, usuario_id, codigo, expires_at, usado, created_at)
       VALUES ($1, $2, $3, $4, FALSE, $5) RETURNING id`,
      [ENTIDAD_OTP, contrato.id, nuevo, ahora + OTP_EXPIRA_MS, ahora],
    )
    const mail = await enviarEmail({
      to: email,
      subject: 'Tu código para firmar el contrato TuPuesto',
      html: emailHtml({
        categoria: 'otro',
        nombre: contrato.datos?.razonSocial ?? contrato.datos?.razon_social,
        intro: 'Estás por <b>firmar electrónicamente tu contrato TuPuesto</b>. Tu código de verificación es:',
        codigo: nuevo,
        codigoPie: 'Vence en <b>15 minutos</b> y es de un solo uso.',
        nota: 'Si no estás firmando el contrato ahora, ignorá este email.',
      }),
    })
    if (!mail.ok) {
      console.error('firmar: fallo envío OTP:', mail.error)
      return res.status(502).json({ error: 'no se pudo enviar el código — reintentar' })
    }
    await appendEvento(sql, contrato.id, 'otp_enviado', { otp_id: ins[0].id, ip, ua })
    return res.json({ ok: true, enviado: true })
  }

  /* ── paso 'firmar' — pipeline completo ──────────────────────── */
  if (paso === 'firmar') {
    if (contrato.estado === 'firmado') return res.status(409).json({ error: 'el contrato ya está firmado', pdf_hash: contrato.pdf_hash })
    if (contrato.estado !== 'enviado') return res.status(409).json({ error: `estado '${contrato.estado}' no permite firmar` })
    if (acepta !== true) return res.status(400).json({ error: 'se requiere aceptación expresa (acepta: true)' })

    const codigoNorm = String(codigo ?? '').trim()
    if (!/^\d{6}$/.test(codigoNorm)) return res.status(400).json({ error: 'código inválido' })
    if (typeof firma !== 'string' || !FIRMA_RE.test(firma) || firma.length > MAX_FIRMA_BYTES) {
      return res.status(400).json({ error: 'firma requerida como dataURL png/jpeg del canvas' })
    }
    // M7 — rechazar decompression-bombs por dimensiones declaradas en el header
    const px = imagenPixels(firma)
    if (px != null && px > MAX_FIRMA_PIXELS) {
      return res.status(400).json({ error: 'la imagen de firma excede el tamaño máximo' })
    }

    const otp = await buscarOtpVigente(sql, contrato.id, codigoNorm)
    if (!otp) {
      // A4 — mismo contador que el paso 'otp' (este endpoint también es
      // superficie de brute-force). Respuesta genérica.
      await registrarIntentoOtpFallido(sql, contrato.id)
      return res.status(400).json({ error: 'código inválido o vencido' })
    }

    // PDF canónico server-side (texto + firma embebida + bloque de evidencia)
    const ts = Date.now()
    const cuerpo = contrato.cuerpo ?? await textoCanonico(contrato)
    const meta = {
      contratoId: contrato.id, ts, otpId: otp.id, ip, ua,
      razonSocial: contrato.datos?.razonSocial ?? contrato.datos?.razon_social, cuit: contrato.datos?.cuit, email,
    }
    let pdf
    try {
      pdf = await buildContratoPdf({ cuerpo, firmaDataUrl: firma, meta })
    } catch (e) {
      console.error('firmar: pdf falló:', e)
      return res.status(500).json({ error: 'no se pudo generar el PDF del contrato' })
    }
    const pdfHash = sha256hex(pdf)

    // consumo atómico del OTP DESPUÉS del PDF: un fallo de generación no quema
    // el código; si otro request lo consumió en paralelo, este queda afuera
    if (!(await consumirOtp(sql, otp.id))) {
      return res.status(409).json({ error: 'código inválido o vencido' })
    }

    // cierre atómico del estado — un segundo request concurrente queda afuera
    const upd = await sql.query(
      `UPDATE contratos SET estado = 'firmado', pdf = $2, pdf_hash = $3, cuerpo = $4,
         firma_dataurl = $5, firmado_at = $6
       WHERE id = $1 AND estado = 'enviado' RETURNING id`,
      [contrato.id, pdf, pdfHash, cuerpo, firma, ts],
    )
    if (!upd.length) return res.status(409).json({ error: 'el contrato cambió de estado — recargar' })

    // hash-chain: trazo → aceptación → anclaje → entrega (append-only)
    await appendEvento(sql, contrato.id, 'trazo_capturado', {
      firma_sha256: sha256hex(firma), bytes: firma.length, ip, ua,
    })
    await appendEvento(sql, contrato.id, 'aceptado', {
      acepta: true, cuerpo_sha256: sha256hex(cuerpo), pdf_hash: pdfHash,
      leyenda: 'Acepto el contrato — firma electrónica simple (Ley 25.506)', ip, ua,
    })

    // anclaje OpenTimestamps del digest del PDF — async, con fallback:
    // si falla no bloquea la firma, queda anclaje_pendiente=true para reintentar
    const ots = await anclarOts(pdf)
    let anclaje = 'ok'
    if (ots.ok) {
      await appendEvento(sql, contrato.id, 'anclado', {
        digest: ots.digest, receipt_b64: ots.receipt_b64, calendario: 'a.pool.opentimestamps.org',
      })
    } else {
      anclaje = 'pendiente'
      console.error('firmar: OTS falló (queda pendiente):', ots.error)
      await sql.query(`UPDATE contratos SET anclaje_pendiente = TRUE WHERE id = $1`, [contrato.id])
      await appendEvento(sql, contrato.id, 'anclado', {
        digest: ots.digest, estado: 'pendiente', motivo: ots.error,
      })
    }

    // copia probatoria al domicilio electrónico del suscriptor
    const mail = await enviarEmail({
      to: email,
      subject: 'Contrato TuPuesto firmado — copia en PDF',
      html: emailHtml({
        categoria: 'otro',
        nombre: contrato.datos?.razonSocial ?? contrato.datos?.razon_social,
        intro: 'Tu <b>contrato TuPuesto quedó firmado electrónicamente</b>. Adjuntamos la copia en PDF.<br><br>' +
          `Hash de integridad (SHA-256):<br><code style="word-break:break-all;font-size:11px">${pdfHash}</code>`,
        nota: 'Conservá este email: es tu copia del contrato y permite verificar su integridad. ' +
          `El documento quedó anclado con timestamp externo${anclaje === 'ok' ? ' (OpenTimestamps)' : ' (anclaje en proceso)'}.`,
      }),
      attachments: [{ filename: `contrato-tupuesto-${contrato.id}.pdf`, content: pdf.toString('base64') }],
    })
    await appendEvento(sql, contrato.id, 'copia_entregada', mail.ok
      ? { email_id: mail.id, to: email }
      : { ok: false, error: mail.error, to: email })
    if (!mail.ok) console.error('firmar: copia por email falló:', mail.error)

    return res.json({ ok: true, estado: 'firmado', pdf_hash: pdfHash, anclaje, copia_enviada: !!mail.ok })
  }

  return res.status(400).json({ error: 'paso inválido (visto|otp|firmar)' })
}
