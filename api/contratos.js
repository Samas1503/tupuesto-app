// POST /api/contratos — crea contrato (admin) y envía el link de firma por Resend
//   Body plano o anidado — acepta ambos (T02 manda plano camelCase):
//     { razonSocial|razon_social, cuit, email, plan, precio, domicilio?,
//       duenio_id|duenioId?, plantilla_version? }  o  { datos: {...} }
//   accion: 'anular' + { id } → marca el contrato como anulado (estado 'anulado').
//   Respuesta: { ok, id, token, link, estado, contrato }
// GET  /api/contratos           — lista de contratos para la vista admin
// GET  /api/contratos?token=    — contrato puntual para la página pública de
//      firma (mismo render que GET /api/firmar?token= — el token UUID es la
//      credencial, reemplaza al login). Devuelve {ok, estado, datos, cuerpo,…}
//
// Env: DATABASE_URL, RESEND_API_KEY, FROM_EMAIL (opcional), BASE_URL (opcional)
// Nota: como el resto de la API (send-pin, sync) no hay auth server-side — el
// gating es client-side (la vista admin solo es accesible con login admin).
import { neon } from '@neondatabase/serverless'
import { emailHtml } from './email-template.js'
import { appendEvento, clientIp, clientUa, cors, enviarEmail, textoCanonico } from './firma-lib.js'

const baseUrl = () => (process.env.BASE_URL ?? 'https://tupuesto.app').replace(/\/$/, '')
const linkDe = (token) => `${baseUrl()}/app/firmar?token=${token}`

const contratoPublico = (c) => ({
  id: c.id, token: c.token, duenio_id: c.duenio_id,
  plantilla_version: c.plantilla_version, datos: c.datos, estado: c.estado,
  pdf_hash: c.pdf_hash, anclaje_pendiente: c.anclaje_pendiente,
  provider: c.provider, envelope_id: c.envelope_id,
  created_at: c.created_at, enviado_at: c.enviado_at, firmado_at: c.firmado_at,
  link: linkDe(c.token),
})

// Normaliza el input (plano o {datos:{…}}, snake_case o camelCase) al shape
// canónico camelCase que espera la plantilla de T03 (api/templates/contrato-v1.js).
// Los campos extra del caller se preservan dentro de datos.
function normDatos(body) {
  const src = body?.datos && typeof body.datos === 'object' && !Array.isArray(body.datos) ? body.datos : body
  const pick = (...ks) => {
    for (const k of ks) {
      const v = src?.[k]
      if (v != null && String(v).trim() !== '') return typeof v === 'string' ? v.trim() : v
    }
    return undefined
  }
  const datos = { ...src }
  datos.razonSocial = pick('razonSocial', 'razon_social', 'razon', 'suscriptor')
  datos.cuit = pick('cuit', 'CUIT')
  datos.email = pick('email', 'mail', 'correo')
  datos.domicilio = pick('domicilio', 'domicilio_legal', 'direccion')
  datos.plan = pick('plan')
  datos.precio = pick('precio', 'monto', 'price')
  for (const k of ['razon_social', 'razon', 'suscriptor', 'CUIT', 'mail', 'correo', 'domicilio_legal', 'direccion', 'monto', 'price', 'datos',
                   'accion', 'id', 'duenio_id', 'duenioId', 'plantilla_version', 'plantillaVersion', 'token', 'paso']) {
    delete datos[k]
  }
  for (const k of Object.keys(datos)) if (datos[k] === undefined) delete datos[k]
  if (typeof datos.email === 'string') datos.email = datos.email.toLowerCase()
  return datos
}

export default async function handler(req, res) {
  // cupos del plan fundador — cualquier visitante lo consulta (landing)
  if (req.method === 'GET' && (req.query.cupos === '1' || req.query.cupos === 'true')) {
    const sql = neon(process.env.DATABASE_URL)
    const t = await sql.query("SELECT count(*) c FROM usuarios WHERE plan = 'fundador' AND activo = true AND eliminado = false")
    const cupos = 10
    return res.json({ cupos, tomados: Number(t[0].c), quedan: Math.max(0, cupos - Number(t[0].c)) })
  }

  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL no configurada' })
  const sql = neon(process.env.DATABASE_URL)

  /* ── GET ────────────────────────────────────────────────────── */
  if (req.method === 'GET') {
    const token = req.query?.token
    if (token != null) {
      // render público por token (página /app/firmar — T02 la llama acá)
      if (!/^[0-9a-f-]{36}$/i.test(String(token))) return res.status(400).json({ error: 'token inválido' })
      const rows = await sql.query(
        `SELECT id, datos, estado, plantilla_version, cuerpo, created_at, firmado_at,
                anclaje_pendiente, pdf_hash FROM contratos WHERE token = $1 LIMIT 1`,
        [String(token)],
      )
      const c = rows[0]
      if (!c) return res.status(404).json({ error: 'contrato no encontrado' })
      if (c.estado === 'anulado') return res.status(410).json({ error: 'contrato anulado' })
      // si ya se firmó, el cuerpo guardado es el que entró al PDF
      const cuerpo = c.cuerpo ?? await textoCanonico(c)
      return res.json({
        ok: true, estado: c.estado, datos: c.datos, cuerpo, texto: cuerpo,
        plantilla_version: c.plantilla_version,
        firmado_at: c.firmado_at, anclaje_pendiente: c.anclaje_pendiente, pdf_hash: c.pdf_hash,
      })
    }
    const rows = await sql.query(
      `SELECT id, token, duenio_id, plantilla_version, datos, estado, pdf_hash,
              anclaje_pendiente, provider, envelope_id, created_at, enviado_at, firmado_at
       FROM contratos ORDER BY id DESC LIMIT 200`,
    )
    return res.json({ ok: true, contratos: rows.map(contratoPublico) })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const { accion, id } = req.body ?? {}

  /* ── POST acción anular ─────────────────────────────────────── */
  if (accion === 'anular') {
    const cid = Number(id)
    if (!Number.isInteger(cid)) return res.status(400).json({ error: 'id inválido' })
    const r = await sql.query(
      `UPDATE contratos SET estado = 'anulado' WHERE id = $1 AND estado IN ('borrador','enviado') RETURNING token`,
      [cid],
    )
    if (!r.length) return res.status(409).json({ error: 'no se puede anular (estado actual no lo permite)' })
    await appendEvento(sql, cid, 'anulado', { ip: clientIp(req), ua: clientUa(req) })
    return res.json({ ok: true, estado: 'anulado' })
  }

  /* ── POST crear + enviar link ───────────────────────────────── */
  const datos = normDatos(req.body)
  const email = typeof datos.email === 'string' ? datos.email.trim().toLowerCase() : ''
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'email requerido y válido (es el domicilio electrónico del suscriptor)' })
  }
  for (const k of ['razonSocial', 'cuit', 'plan']) {
    if (datos[k] == null || String(datos[k]).trim() === '') {
      return res.status(400).json({ error: `${k} requerido (identidad declarada del suscriptor)` })
    }
  }
  datos.email = email
  const duenioId = req.body?.duenio_id ?? req.body?.duenioId ?? null
  const plantillaVersion = req.body?.plantilla_version ?? req.body?.plantillaVersion ?? 'contrato-v1'

  const tipo = req.body?.tipo === 'prueba15' ? 'prueba15' : 'mensual'
  const plazoMeses = tipo === 'mensual' ? Number(req.body?.plazoMeses ?? req.body?.plazo_meses) || null : null
  const esFundador = req.body?.esFundador === true || req.body?.es_fundador === true
  datos.tipo = tipo
  if (plazoMeses) datos.plazoMeses = plazoMeses
  if (esFundador) datos.esFundador = true

  const ahora = Date.now()
  const inserted = await sql.query(
    `INSERT INTO contratos (tipo, plazo_meses, es_fundador, duenio_id, plantilla_version, datos, estado, created_at, enviado_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'borrador', $7, $7) RETURNING id, token`,
    [tipo, plazoMeses, esFundador, duenioId, plantillaVersion, JSON.stringify(datos), ahora],
  )
  const contrato = inserted[0]
  await appendEvento(sql, contrato.id, 'solicitud', {
    datos, duenio_id: duenioId, ip: clientIp(req), ua: clientUa(req),
  })

  const link = linkDe(contrato.token)
  const mail = await enviarEmail({
    to: email,
    subject: 'Tu contrato TuPuesto — link de firma',
    html: emailHtml({
      categoria: 'otro',
      nombre: datos.razonSocial,
      intro: 'Ya está listo tu <b>contrato de suscripción TuPuesto</b>. Revisalo y firmalo electrónicamente desde este link:',
      ctaUrl: link,
      ctaTexto: 'Revisar y firmar el contrato',
      nota: 'Vas a recibir un <b>código de verificación</b> en esta casilla al momento de firmar. ' +
        'La firma tiene validez de <b>firma electrónica simple</b> (Ley 25.506) y la copia firmada te llega por email. ' +
        'Este link es personal — no lo compartas.',
    }),
  })
  if (!mail.ok) {
    console.error('contratos: fallo envío link:', mail.error)
    // el contrato queda en borrador — el admin puede copiar el link a mano
    return res.status(502).json({ ok: false, error: 'contrato creado pero el email falló', id: contrato.id, token: contrato.token, link })
  }

  const up = await sql.query(
    `UPDATE contratos SET estado = 'enviado' WHERE id = $1
     RETURNING id, token, duenio_id, plantilla_version, datos, estado, pdf_hash,
               anclaje_pendiente, provider, envelope_id, created_at, enviado_at, firmado_at`,
    [contrato.id],
  )
  return res.json({ ok: true, id: contrato.id, token: contrato.token, link, estado: 'enviado', contrato: contratoPublico(up[0]) })
}
