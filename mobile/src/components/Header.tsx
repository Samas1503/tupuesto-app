/** Header de la app — marca TuPuesto + campana + nombre + salir.
 *  Equivale al <header> del App.tsx web (sin SoporteBtn ni PlanBadge visible;
 *  el plan se muestra en pantallas del dueño donde aplica). */

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { C, useAccent } from '../theme'
import { all, useStoreVersion } from '../lib/store'
import { sesionActual } from '../lib/auth'
import { planDe } from '../lib/planes'
import { useNetInfo, useOutboxCount } from '../lib/outbox'

export function Header({ onSalir }: { onSalir: () => void }) {
  const insets = useSafeAreaInsets()
  const accent = useAccent()
  const nav = useNavigation<any>()
  useStoreVersion()
  const sesion = sesionActual()
  const usuario = sesion ? all('usuarios').find(u => u.id === sesion.id) : undefined
  const noLeidas = sesion
    ? all('notificaciones').filter(n => n.usuarioId === sesion.id && !n.leida).length
    : 0
  const plan = usuario?.rol === 'duenio' ? planDe(usuario.plan) : null
  const net = useNetInfo()
  const pendientes = useOutboxCount()
  const offline = net.isConnected === false || net.isInternetReachable === false

  return (
    <View style={[st.header, { paddingTop: insets.top + 8 }]}>
      <View style={st.row}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <View style={[st.logo, { backgroundColor: accent }]}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>TP</Text>
          </View>
          <Text style={st.marca}>
            Tu<Text style={{ color: accent }}>Puesto</Text>
          </Text>
          {plan && (
            <View style={[st.planPill, { backgroundColor: `${accent}22` }]}>
              <Text style={{ fontSize: 9, fontWeight: '800', color: accent }}>{plan.nombre}</Text>
            </View>
          )}
        </View>

        {/* estado de conectividad / cola offline */}
        {(offline || pendientes > 0) && (
          <View style={[st.offChip, { backgroundColor: offline ? '#b8490018' : '#f59e4220' }]}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: offline ? C.danger : '#92600a' }}>
              {offline ? 'sin conexión' : `${pendientes} pendiente${pendientes !== 1 ? 's' : ''}`}
            </Text>
          </View>
        )}

        {/* campana → pantalla Notificaciones */}
        <Pressable onPress={() => nav.navigate('Notificaciones')} hitSlop={10} style={{ marginRight: 12 }}>
          <Text style={{ fontSize: 19 }}>🔔</Text>
          {noLeidas > 0 && (
            <View style={st.badge}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{noLeidas}</Text>
            </View>
          )}
        </Pressable>

        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: C.navy, maxWidth: 110 }}>
          {usuario?.nombre ?? (sesion?.rol === 'admin' ? 'Admin' : '…')}
        </Text>
        <Pressable onPress={onSalir} hitSlop={8}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: accent, marginLeft: 10 }}>Salir</Text>
        </Pressable>
      </View>
      <View style={{ height: 3, backgroundColor: accent, opacity: 0.85, marginTop: 8 }} />
    </View>
  )
}

const st = StyleSheet.create({
  header: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 44,
    gap: 8,
  },
  logo: {
    height: 30, width: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  marca: { fontSize: 19, fontWeight: '800', color: C.navy, letterSpacing: -0.5 },
  planPill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  offChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginRight: 10 },
  badge: {
    position: 'absolute', top: -4, right: -6, minWidth: 15, height: 15,
    borderRadius: 8, backgroundColor: C.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
})
