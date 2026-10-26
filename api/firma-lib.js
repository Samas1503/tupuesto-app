import { applyCors } from './_lib/cors.js'
// Helpers compartidos del flujo de firma electrónica de contratos (T01).
//
// Modelo legal (ver .context/work/contratos-firma/debate/synthesis.md):
// firma electrónica SIMPLE (Ley 25.506) + audit trail: hash-chain append-only
// en firma_eventos + anclaje externo OpenTimestamps + copia PDF por email +
// identidad declarada (CUIT) y domicilio electrónico (art. 75 CPCCN).
//
// Los endpoints que lo usan: contratos.js, firmar.js, paquete.js.
import { createHash } from 'node:crypto'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const GENESIS_HASH = '0'.repeat(64)   // prev_hash del primer evento de cada contrato
export const ENTIDAD_OTP = 'firma_contrato'  // codigos_reset.entidad para OTPs de firma
export const OTP_EXPIRA_MS = 15 * 60 * 1000  // igual que los códigos de reset de PIN
export const OTS_CALENDAR = 'https://a.pool.opentimestamps.org/digest'
export const OTS_TIMEOUT_MS = 8_000          // anclaje async con fallback — nunca bloquea la firma
export const MAX_FIRMA_BYTES = 700 * 1024    // cap del dataURL del canvas (~512KB binario)
export const MAX_FIRMA_PIXELS = 4_000_000    // anti decompression-bomb (PNG/JPG declarados en el header)
export const MAX_INTENTOS_OTP = 5            // intentos fallidos antes de quemar el código
export const OTP_REENVIO_MS = 60_000         // cooldown mínimo entre envíos de OTP

export const sha256hex = (data) => createHash('sha256').update(data).digest('hex')
export const sha256buf = (data) => createHash('sha256').update(data).digest()

/* ── hash-chain ────────────────────────────────────────────────── */
// JSON con claves ordenadas recursivamente: event_hash es recomputable
// byte a byte sin depender del orden de inserción de las claves.
export function stableJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']'
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}'
}

// event_hash = sha256hex(prev_hash + '|' + tipo + '|' + stableJson(payload) + '|' + ts)
// (el spec del ticket dice "prev_hash+tipo+payload+ts" — los separadores evitan ambigüedad)
export function eventHash({ prevHash, tipo, payload, ts }) {
  return sha256hex(`${prevHash}|${tipo}|${stableJson(payload)}|${ts}`)
}

// Inserta un evento al final de la cadena del contrato (append-only lo
// garantiza el trigger firma_eventos_append_only del migrate).
//
// Race de la hash-chain (M4): dos appends concurrentes podían leer la misma
// punta (prev_hash) y crear una bifurcación invisible en el audit trail.
// El driver HTTP de @neondatabase/serverless no tiene transacciones
// interactivas — sql.transaction() arma TODAS las queries antes de mandarlas
// (no se puede usar el resultado del SELECT para construir el INSERT en el
// mismo tx). La serialización se resuelve así:
//   1) lectura de la punta fuera de tx — es solo una estimación;
//   2) UNA transacción no-interactiva con DOS statements que corren EN ORDEN
//      en la misma conexión/tx: primero pg_advisory_xact_lock(ns, contrato_id)
//      (serializa todos los appends del contrato; el lock se libera al commit)
//      y después un INSERT ... SELECT ... WHERE <la punta sigue siendo la
//      leída>. El WHERE se evalúa con el lock ya tomado — si la punta cambió
//      entre 1 y 2, el INSERT devuelve 0 filas y se relee/reintenta.
//   Defensa residual: índice UNIQUE (contrato_id, prev_hash) del migrate —
//   cualquier colisión que escape al lock aborta el INSERT (23505) y también
//   dispara reintento. Si el segundo intento también falla, se lanza.
const ADV_LOCK_NS = 0x5450 // 'TP' — namespace int4 del advisory lock de firma

export async function appendEvento(sql, contratoId, tipo, payload = {}, ts = Date.now()) {
  for (let intento = 0; intento < 2; intento++) {
    const prev = await sql.query(
      `SELECT event_hash FROM firma_eventos WHERE contrato_id = $1 ORDER BY id DESC LIMIT 1`,
      [contratoId],
    )
    const prevHash = prev[0]?.event_hash ?? GENESIS_HASH
    const hash = eventHash({ prevHash, tipo, payload, ts })
    let ins
    try {
      const results = await sql.transaction(tx => [
        tx.query(`SELECT pg_advisory_xact_lock($1, $2)`, [ADV_LOCK_NS, contratoId]),
        tx.query(
          `INSERT INTO firma_eventos (contrato_id, tipo, payload, prev_hash, event_hash, created_at)
           SELECT $1, $2, $3::jsonb, $4, $5, $6
           WHERE COALESCE(
             (SELECT event_hash FROM firma_eventos WHERE contrato_id = $1 ORDER BY id DESC LIMIT 1),
             $7
           ) = $4
           RETURNING id, event_hash`,
          [contratoId, tipo, JSON.stringify(payload), prevHash, hash, ts, GENESIS_HASH],
        ),
      ])
      ins = results[1]
    } catch (e) {
      // 23505 = violación del UNIQUE (contrato_id, prev_hash) — punta concurrente
      if (intento === 0 && (e?.code === '23505' || /duplicate key/i.test(e?.message ?? ''))) continue
      throw e
    }
    if (ins?.length) return ins[0]
    // punta cambió entre la lectura y el lock — el loop relee y reintenta
  }
  throw new Error(`appendEvento: punta de firma_eventos cambió dos veces — evento '${tipo}' no encadenado (contrato ${contratoId})`)
}

// Recomputa la cadena completa — true si cada event_hash verifica y el
// encadenamiento prev_hash → event_hash es continuo desde GENESIS.
export function verificarCadena(eventos) {
  let prev = GENESIS_HASH
  for (const ev of eventos) {
    if (ev.prev_hash !== prev) return false
    if (eventHash({ prevHash: ev.prev_hash, tipo: ev.tipo, payload: ev.payload, ts: Number(ev.created_at) }) !== ev.event_hash) return false
    prev = ev.event_hash
  }
  return true
}

/* ── metadata del request ──────────────────────────────────────── */
// M3 — IP forense: el PRIMER elemento de x-forwarded-for lo puede inventar el
// cliente (spoof). Vercel expone x-vercel-forwarded-for con la IP que vio el
// edge; si no está, el ÚLTIMO elemento de x-forwarded-for es el que agregó el
// proxy/edge (la IP real del cliente queda al final de la cadena).
export const clientIp = (req) => {
  const last = (h) => String(h ?? '').split(',').pop()?.trim() || null
  return last(req.headers['x-vercel-forwarded-for'])
      ?? last(req.headers['x-forwarded-for'])
      ?? req.socket?.remoteAddress
      ?? null
}
export const clientUa = (req) => req.headers['user-agent'] ?? null

/* ── texto canónico del contrato ───────────────────────────────── */
// Si T03 ya mergeó api/templates/contrato-v1.js se usa ese módulo (la lane
// legal es dueña del texto); si no, fallback embebido — ambos determinísticos.
// El texto EFECTIVAMENTE firmado queda guardado en contratos.cuerpo, así el
// paquete probatorio verifica igual aunque la plantilla cambie después.
async function cargarTemplateExterno() {
  try {
    const m = await import('./templates/contrato-v1.js')
    // T03 exporta generarContrato(datos) — se toleran otros nombres por las dudas
    const fn = m.generarContrato ?? m.renderContrato ?? m.contratoV1 ?? m.render ?? m.default
    if (typeof fn === 'function') return fn
  } catch { /* plantilla T03 no disponible todavía → fallback */ }
  return null
}

function fmtFecha(ts) {
  return new Date(Number(ts)).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
}

// Mismo saneado que limpiar() de templates/contrato-v1.js: colapsa cualquier
// secuencia de espacios/saltos a un solo espacio. Todo valor interpolado en el
// texto legal pasa por acá — un dato con '\n' no puede inyectar líneas falsas.
function limpiar(valor) {
  return String(valor).trim().replace(/\s+/g, ' ')
}

// Mapea contrato.datos (JSONB, camelCase normalizado en POST /api/contratos) al
// shape que exige la plantilla T03: razonSocial, cuit, email, domicilio, plan,
// precio, fecha — todos requeridos, la fecha es determinística por contrato.
function datosParaTemplate(contrato) {
  const d = contrato.datos ?? {}
  return {
    ...d,
    razonSocial: d.razonSocial ?? d.razon_social,
    domicilio: d.domicilio ?? d.domicilio_legal ?? '[domicilio no declarado]',
    fecha: d.fecha ?? fmtFecha(contrato.created_at),
  }
}

// Plantilla fallback contrato-v1 — incluye las cláusulas fijadas por el debate
// legal: domicilio electrónico, aceptación del medio electrónico (Ley 25.506),
// OTP + copia por email, objeto/plan/precio/permanencia/cancelación.
export function textoFallbackV1(contrato) {
  const d = contrato.datos ?? {}
  const fecha = fmtFecha(contrato.created_at)
  // todos los datos interpolados van saneados (limpiar) — sin '\n' inyectables
  const razonSocial = limpiar(d.razonSocial ?? d.razon_social ?? '—')
  const cuit = limpiar(d.cuit ?? '—')
  const email = limpiar(d.email ?? '—')
  const plan = limpiar(d.plan ?? '—')
  const precio = limpiar(d.precio ?? 'a convenir')
  const version = limpiar(contrato.plantilla_version ?? 'contrato-v1')
  return [
    'CONTRATO DE PRESTACIÓN DE SERVICIOS — TUPUESTO',
    `Versión de plantilla: ${version}`,
    `Contrato N.º ${contrato.id} — celebrado el ${fecha}.`,
    '',
    `Entre TuPuesto (en adelante "EL PROVEEDOR") y ${razonSocial}, CUIT ${cuit}, con domicilio electrónico constituido en ${email} (en adelante "EL SUSCRIPTOR"), se acuerda lo siguiente:`,
    '',
    'PRIMERA — OBJETO. EL PROVEEDOR pone a disposición del SUSCRIPTOR el servicio de software TuPuesto (control de ventas, jornadas, productos y vendedores para puestos de venta), en modalidad multi-tenant accesible desde dispositivos móviles.',
    '',
    `SEGUNDA — PLAN Y PRECIO. El SUSCRIPTOR contrata el plan "${plan}" por un precio de ${precio}, según las condiciones vigentes informadas al momento de la suscripción.`,
    '',
    'TERCERA — PERMANENCIA Y CANCELACIÓN. El servicio no exige permanencia mínima salvo pacto en contrario informado por escrito. El SUSCRIPTOR puede cancelar en cualquier momento desde la aplicación o por notificación al PROVEEDOR; la baja se hace efectiva al cierre del período abonado.',
    '',
    'CUARTA — DOMICILIO ELECTRÓNICO. A los fines del art. 75 del Código Procesal Civil y Comercial de la Nación, el SUSCRIPTOR constituye como domicilio electrónico válido la casilla de correo declarada en este contrato, donde se reputarán válidas todas las notificaciones y comunicaciones relativas al mismo.',
    '',
    'QUINTA — MEDIO ELECTRÓNICO Y FIRMA. Las partes consienten la celebración del presente por medios electrónicos y reconocen la firma electrónica simple como expresión válida de la voluntad contractual conforme la Ley 25.506. La autoría se acredita mediante un código de un solo uso (OTP) enviado al domicilio electrónico declarado, sumado al registro de evidencia técnica (hash del documento, fecha, dirección IP y traza capturada).',
    '',
    'SEXTA — COPIA Y EVIDENCIA. Suscripto el contrato, se envía copia íntegra en PDF al domicilio electrónico del SUSCRIPTOR junto con el hash de integridad del documento. El registro de eventos de firma se conserva en una cadena de custodia append-only con anclaje de timestamp externo (OpenTimestamps).',
    '',
    `En prueba de conformidad, el SUSCRIPTOR acepta y firma electrónicamente el ${fecha}.`,
  ].join('\n')
}

export async function textoCanonico(contrato) {
  const externo = await cargarTemplateExterno()
  if (externo) {
    try { return externo(datosParaTemplate(contrato)) }
    catch (e) { console.error('firma-lib: template externo falló, uso fallback:', e) }
  }
  return textoFallbackV1(contrato)
}

/* ── dimensiones de imagen sin decodificar (M7) ────────────────── */
// Lee width×height del header del PNG/JPG para rechazar decompression-bombs
// ANTES de que pdf-lib decodifique: una imagen de pocos KB puede declarar
// decenas de miles de px por lado y explotar la memoria al embeberse.
function pngDims(buf) {
  // signature 8B + IHDR: len 4B + tipo 4B + width 4B + height 4B (big-endian)
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}
function jpgDims(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue }
    const marker = buf[i + 1]
    // SOFn (start of frame) — excluye DHT/JPG/DAC que caen en el mismo rango
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { i += 2; continue } // sin payload
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

// Devuelve los píxeles declarados por la imagen (w×h) o null si no se pudo
// leer el header — null NO es luz verde, solo "no verificable".
export function imagenPixels(dataUrl) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl ?? '')
  if (!m) return null
  const buf = Buffer.from(m[2], 'base64')
  const dims = /png/i.test(m[1]) ? pngDims(buf) : jpgDims(buf)
  return dims ? dims.w * dims.h : null
}

/* ── PDF canónico ──────────────────────────────────────────────── */
// PDF generado server-side con pdf-lib: texto canónico paginado + página de
// firma con la imagen del canvas embebida y bloque de evidencia (OTP, IP, hash).
export async function buildContratoPdf({ cuerpo, firmaDataUrl, meta }) {
  const doc = await PDFDocument.create()
  doc.setTitle(`Contrato TuPuesto N.º ${meta.contratoId}`)
  doc.setAuthor('TuPuesto — firma electrónica')
  doc.setProducer('TuPuesto api/firmar (pdf-lib)')
  doc.setCreationDate(new Date(meta.ts))

  const font = await doc.embedFont(StandardFonts.Courier)
  const fontBold = await doc.embedFont(StandardFonts.CourierBold)
  const SIZE = { w: 595.28, h: 841.89 } // A4
  const MARGIN = 56
  const FS = 9.5, LEAD = 13.5, COLS = 92

  const wrap = (line) => {
    if (line.length <= COLS) return [line]
    const out = []
    let rest = line
    while (rest.length > COLS) {
      let cut = rest.lastIndexOf(' ', COLS)
      if (cut < 20) cut = COLS
      out.push(rest.slice(0, cut))
      rest = rest.slice(cut + (rest[cut] === ' ' ? 1 : 0))
    }
    out.push(rest)
    return out
  }

  const lineas = cuerpo.split('\n').flatMap(wrap)
  let page = doc.addPage([SIZE.w, SIZE.h])
  let y = SIZE.h - MARGIN
  for (const ln of lineas) {
    if (y < MARGIN) { page = doc.addPage([SIZE.w, SIZE.h]); y = SIZE.h - MARGIN }
    const titulo = /^[A-ZÁÉÍÓÚÑ].{0,80}—/u.test(ln) || ln.startsWith('CONTRATO DE')
    page.drawText(ln, { x: MARGIN, y, size: FS, font: titulo ? fontBold : font, color: rgb(0.1, 0.1, 0.12) })
    y -= LEAD
  }

  // ── página de firma ──
  if (y < MARGIN + 240) { page = doc.addPage([SIZE.w, SIZE.h]); y = SIZE.h - MARGIN }
  y -= LEAD * 2
  page.drawText('FIRMA DEL SUSCRIPTOR', { x: MARGIN, y, size: FS + 1, font: fontBold, color: rgb(0.1, 0.1, 0.12) })
  y -= LEAD

  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(firmaDataUrl ?? '')
  if (!m) throw new Error('firma dataURL inválida')
  const imgBytes = Buffer.from(m[2], 'base64')
  // defensa en profundidad — el check 400 vive en firmar.js; si se llega acá
  // con una imagen gigante se aborta antes de que pdf-lib la decodifique
  const dims = /png/i.test(m[1]) ? pngDims(imgBytes) : jpgDims(imgBytes)
  if (dims && dims.w * dims.h > MAX_FIRMA_PIXELS) {
    throw new Error(`imagen de firma excede ${MAX_FIRMA_PIXELS} píxeles (${dims.w}×${dims.h})`)
  }
  const img = /png/i.test(m[1]) ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes)

  const boxW = 260, boxH = 120
  y -= boxH
  page.drawRectangle({ x: MARGIN, y, width: boxW, height: boxH, borderColor: rgb(0.55, 0.6, 0.68), borderWidth: 1 })
  const scale = Math.min((boxW - 16) / img.width, (boxH - 16) / img.height)
  const iw = img.width * scale, ih = img.height * scale
  page.drawImage(img, { x: MARGIN + (boxW - iw) / 2, y: y + (boxH - ih) / 2, width: iw, height: ih })
  y -= LEAD * 1.5

  const evidencia = [
    `Firmante (identidad declarada): ${meta.razonSocial} — CUIT ${meta.cuit}`,
    `Domicilio electrónico: ${meta.email}`,
    `Fecha/hora de firma: ${new Date(meta.ts).toISOString()}`,
    `Verificación: código OTP de un solo uso al domicilio electrónico (ID código #${meta.otpId})`,
    `IP de firma: ${meta.ip ?? 'n/d'}`,
    'Firma electrónica simple — Ley 25.506. El documento y su evidencia se registran en cadena de custodia con anclaje OpenTimestamps.',
  ]
  for (const ln of evidencia.flatMap(wrap)) {
    page.drawText(ln, { x: MARGIN, y, size: FS - 1, font, color: rgb(0.3, 0.32, 0.36) })
    y -= LEAD - 2
  }

  return Buffer.from(await doc.save())
}

/* ── anclaje OpenTimestamps ────────────────────────────────────── */
// Sube el digest SHA-256 del PDF al calendario público. Devuelve
// {ok, receipt_b64, digest} — o {ok:false, error} si falla/timeout.
// NUNCA lanza: el caller decide el fallback (anclaje_pendiente).
export async function anclarOts(pdfBuf) {
  const digest = sha256buf(pdfBuf)
  try {
    const r = await fetch(OTS_CALENDAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Accept': 'application/vnd.opentimestamps.v1' },
      body: digest,
      signal: AbortSignal.timeout(OTS_TIMEOUT_MS),
    })
    if (!r.ok) return { ok: false, error: `OTS ${r.status}: ${await r.text().catch(() => '')}`.slice(0, 300), digest: digest.toString('hex') }
    const receipt = Buffer.from(await r.arrayBuffer())
    return { ok: true, receipt_b64: receipt.toString('base64'), digest: digest.toString('hex') }
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 300), digest: digest.toString('hex') }
  }
}

/* ── OTP contra codigos_reset (patrón verify-reset) ────────────── */
// Fila vigente más reciente para el contrato (entidad='firma_contrato',
// usuario_id = contrato.id — el scope por entidad evita colisiones con
// usuarios reales; verify-reset filtra entidad='usuarios' desde este ticket).
export async function buscarOtpVigente(sql, contratoId, codigo, ahora = Date.now()) {
  const rows = await sql.query(
    `SELECT id FROM codigos_reset
     WHERE entidad = $1 AND usuario_id = $2 AND codigo = $3
       AND usado = FALSE AND expires_at >= $4
     ORDER BY id DESC LIMIT 1`,
    [ENTIDAD_OTP, contratoId, codigo, ahora],
  )
  return rows[0] ?? null
}

// Consume atómico: solo una request puede marcar el código como usado.
export async function consumirOtp(sql, otpId) {
  const r = await sql.query(
    `UPDATE codigos_reset SET usado = TRUE WHERE id = $1 AND usado = FALSE RETURNING id`,
    [otpId],
  )
  return r.length > 0
}

// A4 — cuenta un intento fallido sobre el último código vigente del contrato
// (el que el cliente está tratando de adivinar): intentos+1 y, al llegar a
// MAX_INTENTOS_OTP, lo quema (usado=TRUE) para cortar el brute-force.
// Nunca lanza: si la columna `intentos` todavía no existe (migrate pendiente)
// degrada a no contar — la respuesta al cliente es genérica igual.
export async function registrarIntentoOtpFallido(sql, contratoId) {
  try {
    await sql.query(
      `UPDATE codigos_reset
         SET intentos = intentos + 1,
             usado = CASE WHEN intentos + 1 >= $3 THEN TRUE ELSE usado END
       WHERE id = (
         SELECT id FROM codigos_reset
         WHERE entidad = $1 AND usuario_id = $2 AND usado = FALSE AND expires_at >= $4
         ORDER BY id DESC LIMIT 1
       )`,
      [ENTIDAD_OTP, contratoId, MAX_INTENTOS_OTP, Date.now()],
    )
  } catch (e) {
    console.error('firma-lib: no se pudo registrar intento OTP fallido:', e?.message ?? e)
  }
}

/* ── Resend ────────────────────────────────────────────────────── */
export async function enviarEmail({ to, subject, html, attachments }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY no configurada' }
  const from = process.env.FROM_EMAIL ?? 'TuPuesto <onboarding@resend.dev>'
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, ...(attachments ? { attachments } : {}) }),
    })
    if (!r.ok) return { ok: false, error: `resend ${r.status}: ${await r.text().catch(() => '')}`.slice(0, 300) }
    const body = await r.json().catch(() => ({}))
    return { ok: true, id: body.id ?? null }
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 300) }
  }
}

export const cors = (req, res, methods = 'GET, POST, OPTIONS') => applyCors(req, res, methods)
