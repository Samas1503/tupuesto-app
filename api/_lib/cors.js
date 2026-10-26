// CORS con allowlist — solo orígenes permitidos. Las requests nativas (mobile,
// curl, server-to-server) no mandan Origin → pasan siempre. Los browsers sí lo
// mandan → se valida contra la lista.
const DEFAULT = [
  'https://tupuesto.vercel.app',
  'https://tupuesto-web.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8081',
  'http://localhost:19006',
]
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? DEFAULT.join(','))
  .split(',').map(s => s.trim()).filter(Boolean)

/** Aplica CORS. Devuelve true si ya respondió (OPTIONS o bloqueado) — el caller debe parar. */
export function applyCors(req, res, methods = 'GET, POST, OPTIONS') {
  const origin = req.headers.origin
  const ok = !origin || ALLOWED.includes(origin)

  if (ok && origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Vary', 'Origin')

  if (req.method === 'OPTIONS') { res.status(ok ? 204 : 403).end(); return true }
  if (!ok) { res.status(403).json({ error: 'origen no permitido' }); return true }
  return false
}
