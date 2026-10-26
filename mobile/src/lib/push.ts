/** Push remoto real — registra el Expo push token en Neon (tabla push_tokens)
 *  para que el server pueda disparar notificaciones vía exp.host.
 *  OJO: en Expo Go (SDK 53+) getExpoPushTokenAsync no funciona — se ignora el
 *  error y solo se registra en dev-build/producción.
 *  El envío server→Expo (api/push.js → exp.host) es trabajo pendiente — el
 *  cliente ya deja el token subido. */

import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import { syncPush } from './sync'
import { sesionActual } from './auth'

const K_PUSH = 'tp-push-token'

/** id estable por (usuario, token) — int4 seguro, así el upsert ON CONFLICT(id)
 *  del server reemplaza la misma fila y cada dispositivo conserva la suya */
async function idDe(usuarioId: number, token: string): Promise<number> {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${usuarioId}|${token}`)
  return parseInt(hex.slice(0, 7), 16) // ≤ 0xFFFFFFF = 268M
}

/** pedir permiso + obtener y subir el Expo push token (si aplica) */
export async function registrarPushToken(): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync()
    if (!perm.granted) return
    // en Expo Go / emulador sin projectId esto falla → catch abajo
    const { data: token } = await Notifications.getExpoPushTokenAsync()
    if (!token || typeof token !== 'string') return
    const prev = await AsyncStorage.getItem(K_PUSH)
    if (prev === token) return // ya registrado
    await AsyncStorage.setItem(K_PUSH, token)
    const sesion = sesionActual()
    if (!sesion) return
    const id = await idDe(sesion.id, token)
    await syncPush('push_tokens', [{
      id,
      usuario_id: sesion.id,
      token,
      plataforma: Platform.OS,
      created_at: Date.now(),
    }])
  } catch { /* Expo Go u offline — se reintenta en el próximo login */ }
}
