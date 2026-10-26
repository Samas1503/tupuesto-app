// GET /api/paquete?contrato_id=<id>   (admin — vista "Exportar paquete probatorio")
// GET /api/paquete?token=<uuid>       (el suscriptor con su link también puede)
//
// Devuelve el paquete probatorio exportable en JSON:
//   - datos del contrato + cuerpo canónico firmado
//   - PDF en base64 + pdf_hash (SHA-256)
//   - cadena completa de firma_eventos (prev_hash → event_hash)
//   - receipt OpenTimestamps (base64) si el anclaje se completó
//   - instrucciones de verificación + cadena_valida (recomputada acá)
//
// Cada export se registra como evento 'exportado' en la misma cadena — el log
// de custodia incluye quién/cuándo sacó copias (append-only).
// Env: DATABASE_URL
import { neon } from '@neondatabase/serverless'
import { appendEvento, clientIp, clientUa, cors, verificarCadena } from './firma-lib.js'
import { authOf } from './_lib/auth.js'

const INSTRUCCIONES = [
  '1. Integridad del documento: bajar el PDF (pdf_base64), recomputar SHA-256 y comparar con pdf_hash.',
  '2. Cadena de custodia: para cada evento, recomputar sha256(`${prev_hash}|${tipo}|${JSON.stringify(payload, claves ordenadas)}|${created_at}`) y comparar con event_hash; el primer prev_hash es 64 ceros y cada prev_hash = event_hash anterior.',
  '3. Fecha cierta: el digest OTS (evento "anclado".payload.digest) coincide con pdf_hash; el receipt (payload.receipt_b64) se verifica con `ots verify` de OpenTimestamps o en https://opentimestamps.org.',
  '4. Texto firmado: el campo cuerpo es el texto canónico incluido en el PDF — el contrato lo guarda tal como quedó al momento de la firma.',
]

export default async function handler(req, res) {
  cors(req, res, 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' })
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL no configurada' })
  const sql = neon(process.env.DATABASE_URL)

  const { contrato_id, token } = req.query ?? {}
  let rows
  if (contrato_id != null) {
    // export por id — solo admin (por ?token= queda público: es la copia
    // probatoria del propio firmante, el token UUID es su credencial)
    const sesion = authOf(req)
    if (sesion?.rol !== 'admin') {
      return res.status(sesion ? 403 : 401).json({ error: 'no autorizado' })
    }
    const cid = Number(contrato_id)
    if (!Number.isInteger(cid)) return res.status(400).json({ error: 'contrato_id inválido' })
    rows = await sql.query(`SELECT * FROM contratos WHERE id = $1 LIMIT 1`, [cid])
  } else if (token != null) {
    rows = await sql.query(`SELECT * FROM contratos WHERE token = $1 LIMIT 1`, [String(token)])
  } else {
    return res.status(400).json({ error: 'falta contrato_id o token' })
  }
  const c = rows[0]
  if (!c) return res.status(404).json({ error: 'contrato no encontrado' })

  const eventos = await sql.query(
    `SELECT id, tipo, payload, prev_hash, event_hash, created_at
     FROM firma_eventos WHERE contrato_id = $1 ORDER BY id ASC`,
    [c.id],
  )
  // exportar también es un evento de custodia (la cadena sigue creciendo)
  await appendEvento(sql, c.id, 'exportado', { ip: clientIp(req), ua: clientUa(req), via: token ? 'token' : 'admin' })
  const eventosFull = [
    ...eventos.map(ev => ({ ...ev, payload: typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload })),
  ]
  const anclado = eventosFull.find(ev => ev.tipo === 'anclado' && ev.payload?.receipt_b64)

  return res.json({
    ok: true,
    contrato: {
      id: c.id, token: c.token, duenio_id: c.duenio_id,
      plantilla_version: c.plantilla_version, datos: c.datos, estado: c.estado,
      created_at: c.created_at, enviado_at: c.enviado_at, firmado_at: c.firmado_at,
      pdf_hash: c.pdf_hash, anclaje_pendiente: c.anclaje_pendiente,
      provider: c.provider, envelope_id: c.envelope_id,
    },
    cuerpo: c.cuerpo,
    pdf_base64: (() => {
      if (!c.pdf) return null
      if (Buffer.isBuffer(c.pdf)) return c.pdf.toString('base64')
      const s = String(c.pdf)
      return s.startsWith('\\x') ? Buffer.from(s.slice(2), 'hex').toString('base64') : s
    })(),
    pdf_hash: c.pdf_hash,
    eventos: eventosFull,
    cadena_valida: verificarCadena(eventosFull),
    ots: anclado
      ? { digest: anclado.payload.digest, receipt_b64: anclado.payload.receipt_b64, verificacion: 'https://opentimestamps.org o `ots verify`' }
      : { estado: c.anclaje_pendiente ? 'pendiente' : 'sin_anclaje' },
    instrucciones_verificacion: INSTRUCCIONES,
    exportado_at: Date.now(),
  })
}
