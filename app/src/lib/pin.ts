/** SHA-256 hex del PIN — la app nunca guarda el PIN en claro (Usuario.pinHash ↔ Neon pin_hash).
 *  Web Crypto — solo disponible en contexto seguro (https/localhost). */
export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
