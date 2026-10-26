import { db } from '../db'
import { pushRow } from './snake'
import type { Notificacion } from '../types'

/** crea una notificación para un usuario — queda en Dexie, sube a Neon y dispara la notificación del SO si hay permiso */
export async function notificar(notif: Omit<Notificacion, 'id' | 'leida' | 'createdAt'>) {
  const id = await db.notificaciones.add({ ...notif, leida: false, createdAt: Date.now() })
  void pushRow('notificaciones', id)

  // push del sistema (celu/compu) — solo si el destino es el usuario de esta sesión
  const sesionId = Number(localStorage.getItem('tp-user-id'))
  if (sesionId === notif.usuarioId && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(notif.titulo, { body: notif.descripcion, icon: '/app/icon.svg' }) } catch { /* noop */ }
  }
  return id
}

/** notificaciones para nuevas filas que llegaron por sync — dispara la notificación del SO */
export async function avisarNuevasPendientes() {
  const sesionId = Number(localStorage.getItem('tp-user-id'))
  if (!sesionId || !('Notification' in window) || Notification.permission !== 'granted') return
  const ultimaVista = Number(localStorage.getItem('tp-notif-visto')) || 0
  const nuevas = await db.notificaciones
    .where('usuarioId').equals(sesionId)
    .filter(n => n.createdAt > ultimaVista)
    .toArray()
  for (const n of nuevas) {
    try { new Notification(n.titulo, { body: n.descripcion, icon: '/app/icon.svg' }) } catch { /* noop */ }
  }
  if (nuevas.length) localStorage.setItem('tp-notif-visto', String(Date.now()))
}

/** pide permiso de notificaciones — llamar una vez tras el login */
export async function pedirPermisoNotif() {
  if (!('Notification' in window) || Notification.permission !== 'default') return
  await Notification.requestPermission()
}
