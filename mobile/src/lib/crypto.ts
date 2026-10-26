/** Cifrado del cache local (tp-cache-*) — AES-256-GCM real via @stablelib.
 *  Key = SHA-256(APP_SECRET + salt de dispositivo). El salt (16B aleatorios)
 *  vive en expo-secure-store — se genera la primera vez y no rota, así el
 *  cache sobrevive entre sesiones/logins. Nonce aleatorio por escritura.
 *  Best-effort honesto: la key nunca sale del dispositivo y no hay KMS —
 *  quien tenga el SecureStore del device tiene la key. */

import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { AES } from '@stablelib/aes'
import { GCM } from '@stablelib/gcm'
import * as B64 from '@stablelib/base64'

const APP_SECRET = 'tupuesto-mob-v1'
const K_SALT = 'tp-enc-salt'
const VERSION = 'e1:' // prefijo de formato — permite detectar viejo/no cifrado

let keyPromise: Promise<Uint8Array> | null = null

async function getKey(): Promise<Uint8Array> {
  if (!keyPromise) {
    keyPromise = (async () => {
      let salt = await SecureStore.getItemAsync(K_SALT)
      if (!salt) {
        const rnd = await Crypto.getRandomBytesAsync(16)
        salt = B64.encode(rnd)
        await SecureStore.setItemAsync(K_SALT, salt)
      }
      const hex = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${APP_SECRET}:${salt}`,
      )
      const key = new Uint8Array(32)
      for (let i = 0; i < 32; i++) key[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
      return key
    })()
  }
  return keyPromise
}

/** JSON → base64("e1:" + nonce||ciphertext+tag). AES-GCM con nonce de 12B. */
export async function encryptJson(json: string): Promise<string> {
  const key = await getKey()
  const nonce = await Crypto.getRandomBytesAsync(12)
  const gcm = new GCM(new AES(key))
  const sealed = gcm.seal(nonce, new TextEncoder().encode(json))
  const blob = new Uint8Array(nonce.length + sealed.length)
  blob.set(nonce, 0)
  blob.set(sealed, nonce.length)
  return VERSION + B64.encode(blob)
}

/** base64 cifrado → JSON. null si no es formato cifrado o la key no abre. */
export async function decryptJson(payload: string): Promise<string | null> {
  if (!payload.startsWith(VERSION)) return payload.startsWith('[') ? payload : null
  try {
    const key = await getKey()
    const blob = B64.decode(payload.slice(VERSION.length))
    const nonce = blob.slice(0, 12)
    const gcm = new GCM(new AES(key))
    const plain = gcm.open(nonce, blob.slice(12))
    return plain ? new TextDecoder().decode(plain) : null
  } catch {
    return null
  }
}
