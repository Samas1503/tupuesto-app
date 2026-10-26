// scrypt con salt — formato "salt:hash" en pin_hash. Legacy: sha256 hex plano.
import crypto from 'node:crypto'

const LEGACY = /^[0-9a-f]{64}$/

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex')
  const h = crypto.scryptSync(String(pin), salt, 64).toString('hex')
  return `${salt}:${h}`
}

export function verifyPin(pin, stored) {
  if (!stored) return { ok: false }
  if (LEGACY.test(stored)) {                 // sha256 viejo — migración
    const ok = crypto.createHash('sha256').update(String(pin), 'utf8').digest('hex') === stored
    return { ok, upgrade: ok }
  }
  const [salt, h] = String(stored).split(':')
  if (!salt || !h) return { ok: false }
  const cand = crypto.scryptSync(String(pin), salt, 64)
  const ok = cand.length === Buffer.from(h, 'hex').length &&
    crypto.timingSafeEqual(cand, Buffer.from(h, 'hex'))
  return { ok }
}
