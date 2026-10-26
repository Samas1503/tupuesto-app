/** Sesión con token server-side — el PIN se verifica en el server, no localmente. */

const KEY = 'tp-token'

export const token = () => localStorage.getItem(KEY) ?? ''
export const guardarToken = (t: string) => localStorage.setItem(KEY, t)
export const borrarToken = () => localStorage.removeItem(KEY)

/** headers con el Bearer token para llamadas al backend */
export const authHeader = (): HeadersInit =>
  token() ? { Authorization: `Bearer ${token()}` } : {}

export interface LoginOK {
  token: string
  usuario: {
    id: number; rol: 'admin' | 'duenio' | 'vendedor'; nombre: string; email: string
    debeCambiarPin?: boolean; duenioId?: number; categoria?: string; plan?: string; pinHash?: string
  }
}

/** login contra el server — verifica el PIN en Neon y devuelve token firmado */
export async function loginServer(email: string, pin: string): Promise<LoginOK> {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'login', email, pin }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? 'No se pudo iniciar sesión')
  }
  const data = await res.json() as LoginOK
  guardarToken(data.token)
  return data
}
