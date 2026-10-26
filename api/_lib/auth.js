// Token de sesión firmado con HMAC-SHA256 — tipo JWT liviano sin dependencias.
// Formato: base64url(id|rol|exp) + "." + firma. El servidor lo firma al login
// y los endpoints lo verifican — sin DB, stateless.
import crypto from 'node:crypto'

const SECRET = process.env.AUTH_SECRET || 'tupuesto-dev-secret-cambiar-en-prod'

// mismo TTL que el cliente — vendedor 8h, dueño 16h, admin sin vencimiento
const TTL_MS = {
  vendedor: 8 * 60 * 60 * 1000,
  duenio:   16 * 60 * 60 * 1000,
  admin:    null,
}

export function signToken(usuario) {
  const exp = TTL_MS[usuario.rol] == null ? 0 : Date.now() + TTL_MS[usuario.rol]
  const payload = `${usuario.id}|${usuario.rol}|${exp}`
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
  return `${Buffer.from(payload).toString('base64url')}.${sig}`
}

export function verifyToken(token) {
  try {
    const [p64, sig] = String(token).split('.')
    if (!p64 || !sig) return null
    const payload = Buffer.from(p64, 'base64url').toString()
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const [id, rol, exp] = payload.split('|')
    if (Number(exp) !== 0 && Date.now() > Number(exp)) return null
    return { id: Number(id), rol, exp: Number(exp) }
  } catch { return null }
}

/** sesión del header Authorization: Bearer — null si falta o es inválida */
export function authOf(req) {
  const h = req.headers.authorization ?? ''
  return h.startsWith('Bearer ') ? verifyToken(h.slice(7)) : null
}
