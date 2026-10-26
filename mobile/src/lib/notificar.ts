/** Notificaciones — paridad con lib/notificar.ts de la web.
 *  En RN la "notificación del SO" es expo-notifications (local, inmediata);
 *  la tabla `notificaciones` sigue cruzando dispositivos vía Neon. */

import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { add, all, update } from './store'
import { pushRow } from './snake'
import { sesionActual } from './auth'
import type { Notificacion } from '../types'

const K_VISTO = 'tp-notif-visto'

// mostrar notificaciones locales también con la app en foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

async function dispararLocal(titulo: string, descripcion: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: titulo, body: descripcion },
      trigger: null, // inmediata
    })
  } catch { /* sin permiso o plataforma sin soporte — noop */ }
}

/** crea una notificación para un usuario — queda en el store, sube a Neon y
 *  dispara la notificación local del SO si el destino es esta sesión */
export async function notificar(notif: Omit<Notificacion, 'id' | 'leida' | 'createdAt'>) {
  const id = add('notificaciones', { ...notif, leida: false, createdAt: Date.now() })
  void pushRow('notificaciones', id)

  const sesion = sesionActual()
  if (sesion?.id === notif.usuarioId) await dispararLocal(notif.titulo, notif.descripcion)
  return id
}

/** notificaciones para nuevas filas que llegaron por sync — dispara la del SO */
export async function avisarNuevasPendientes() {
  const sesion = sesionActual()
  if (!sesion) return
  const perm = await Notifications.getPermissionsAsync().catch(() => null)
  if (perm && !perm.granted) return
  const ultimaVista = Number(await AsyncStorage.getItem(K_VISTO)) || 0
  const nuevas = all('notificaciones')
    .filter(n => n.usuarioId === sesion.id && n.createdAt > ultimaVista)
  for (const n of nuevas) await dispararLocal(n.titulo, n.descripcion)
  if (nuevas.length) await AsyncStorage.setItem(K_VISTO, String(Date.now()))
}

/** marca todas las notificaciones de la sesión como leídas (abre el panel) */
export async function marcarTodasLeidas() {
  const sesion = sesionActual()
  if (!sesion) return
  const pend = all('notificaciones').filter(n => n.usuarioId === sesion.id && !n.leida)
  for (const n of pend) {
    update('notificaciones', n.id!, { leida: true })
    void pushRow('notificaciones', n.id!)
  }
}

/** pide permiso de notificaciones — llamar una vez tras el login */
export async function pedirPermisoNotif() {
  try {
    const p = await Notifications.getPermissionsAsync()
    if (!p.granted && p.canAskAgain) await Notifications.requestPermissionsAsync()
  } catch { /* noop */ }
}
