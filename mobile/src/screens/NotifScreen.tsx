/** Pantalla de notificaciones — el panel de la campana de la web.
 *  Marca todas como leídas al abrirse (paridad con NotifBell). */

import React, { useEffect } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { all, useStoreVersion } from '../lib/store'
import { marcarTodasLeidas } from '../lib/notificar'
import { sesionActual } from '../lib/auth'
import { fmtHora } from '../lib/format'
import { C } from '../theme'
import { Chip, EmptyState } from '../components/ui'

const ICONO: Record<string, string> = {
  solicitud: '🔔', cierre: '✅', stock: '📦', login: '👤', sistema: 'ℹ️',
}

export default function NotifScreen() {
  const nav = useNavigation()
  useStoreVersion()
  const sesion = sesionActual()
  const notifs = sesion
    ? [...all('notificaciones')]
        .filter(n => n.usuarioId === sesion.id)
        .sort((a, b) => b.createdAt - a.createdAt)
    : []

  useEffect(() => {
    void marcarTodasLeidas()
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Text style={{ fontSize: 22, color: C.navy }}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>Notificaciones</Text>
      </View>
      {notifs.length === 0 ? (
        <EmptyState titulo="Sin notificaciones" descripcion="Cuando haya movimientos en tu cuenta aparecen acá." />
      ) : (
        <FlatList
          data={notifs.slice(0, 50)}
          keyExtractor={n => String(n.id)}
          contentContainerStyle={{ padding: 16, paddingTop: 0 }}
          renderItem={({ item: n }) => (
            <View style={{
              flexDirection: 'row', gap: 10, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: C.border,
            }}>
              <Text style={{ fontSize: 17 }}>{ICONO[n.tipo] ?? 'ℹ️'}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{n.titulo}</Text>
                <Text style={{ fontSize: 12, color: C.muted }}>{n.descripcion}</Text>
                <Text style={{ fontSize: 10, color: C.muted, opacity: 0.6, marginTop: 2 }}>{fmtHora(n.createdAt)}</Text>
              </View>
              {!n.leida && <Chip texto="nueva" color="accent" />}
            </View>
          )}
        />
      )}
    </View>
  )
}
