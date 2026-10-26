/** SHA-256 hex del PIN — la app nunca guarda el PIN en claro (Usuario.pinHash ↔ Neon pin_hash).
 *  En RN no existe crypto.subtle → expo-crypto.
 *  El server acepta sha256 legado (64-hex) y lo migra a scrypt en el login. */
import * as Crypto from 'expo-crypto'

export async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin)
}

/** PIN aleatorio de 4 dígitos — reemplaza crypto.getRandomValues (no existe en RN) */
export async function pinAleatorio(): Promise<string> {
  const b = await Crypto.getRandomBytesAsync(4)
  const v = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0
  return String(v % 10000).padStart(4, '0')
}
