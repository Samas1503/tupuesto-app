/** Sesión con token server-side — el PIN se verifica en el server, no localmente.
 *  Igual que en web pero con AsyncStorage en vez de localStorage.
 *  El token se cachea en memoria para que authHeader() sea síncrono. */

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Rol } from '../types'

/** base del api — configurable con EXPO_PUBLIC_API_URL para apuntar a un vercel dev */
export const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://tupuesto.vercel.app'

const K_TOKEN = 'tp-token'
const K_ROL = 'tp-rol'
const K_UID = 'tp-user-id'
const K_LOGIN_AT = 'tp-login-at'

/** duración de sesión por rol — ms. Admin sin límite (igual que el token del server). */
const SESION_TTL: Record<Rol, number | null> = {
  vendedor: 8 * 60 * 60 * 1000,
  duenio: 16 * 60 * 60 * 1000,
  admin: null,
}

export interface Sesion {
  rol: Rol
  id: number
}

/* ── token en memoria (cache del AsyncStorage) ── */
let memToken = ''

export const token = () => memToken

export async function guardarToken(t: string) {
  memToken = t
  await AsyncStorage.setItem(K_TOKEN, t)
}

export function borrarToken() {
  memToken = ''
  void AsyncStorage.removeItem(K_TOKEN)
}

/** headers con el Bearer token para llamadas al backend */
export const authHeader = (): Record<string, string> =>
  token() ? { Authorization: `Bearer ${token()}` } : {}

/* ── sesión persistida ── */
let memSesion: Sesion | null = null

/** sesión en memoria — disponible para hooks síncronos una vez hidratada */
export const sesionActual = () => memSesion
export function setSesionActual(s: Sesion | null) {
  memSesion = s
}

/** lee la sesión persistida — respeta el TTL por rol (igual que App.tsx web) */
export async function leerSesion(): Promise<Sesion | null> {
  const [rol, id, loginAt, tok] = await Promise.all([
    AsyncStorage.getItem(K_ROL),
    AsyncStorage.getItem(K_UID),
    AsyncStorage.getItem(K_LOGIN_AT),
    AsyncStorage.getItem(K_TOKEN),
  ])
  memToken = tok ?? ''
  if ((rol === 'duenio' || rol === 'vendedor' || rol === 'admin') && id != null && id !== '') {
    const ttl = SESION_TTL[rol]
    if (ttl != null) {
      const at = Number(loginAt)
      if (!at || Date.now() - at > ttl) {
        await limpiarSesion()
        return null
      }
    }
    memSesion = { rol, id: Number(id) }
    return memSesion
  }
  memSesion = null
  return null
}

export async function guardarSesion(s: Sesion) {
  memSesion = s
  await AsyncStorage.multiSet([
    [K_ROL, s.rol],
    [K_UID, String(s.id)],
    [K_LOGIN_AT, String(Date.now())],
  ])
}

export async function limpiarSesion() {
  memSesion = null
  memToken = ''
  await AsyncStorage.multiRemove([K_ROL, K_UID, K_LOGIN_AT, K_TOKEN])
}

export interface LoginOK {
  token: string
  usuario: {
    id: number
    rol: 'admin' | 'duenio' | 'vendedor'
    nombre: string
    email: string
    debeCambiarPin?: boolean
    duenioId?: number
    categoria?: string
    plan?: string
    pinHash?: string
  }
}

/** login contra el server — verifica el PIN en Neon y devuelve token firmado */
export async function loginServer(email: string, pin: string): Promise<LoginOK> {
  const res = await fetch(`${API}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'login', email, pin }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'No se pudo iniciar sesión')
  }
  const data = (await res.json()) as LoginOK
  await guardarToken(data.token)
  return data
}
