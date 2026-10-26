/** App — gate de sesión + navegación por rol.
 *  Paridad con App.tsx web: localStorage → AsyncStorage, Dexie → store en memoria,
 *  tabs del dueño → bottom-tabs de React Navigation, campana → pantalla modal.
 *  El accent cambia por la categoría del dueño (vendedor hereda la de su dueño). */

import React, { useEffect, useMemo, useState } from 'react'

// canal simple de logout: App lo setea, Header lo invoca desde cualquier pantalla
declare const global: { __salir?: () => void }
import { Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AccentContext, C, accentDe } from './src/theme'
import { Loading } from './src/components/ui'
import { Header } from './src/components/Header'
import LoginScreen from './src/screens/LoginScreen'
import MiDiaScreen from './src/screens/MiDiaScreen'
import HoyScreen from './src/screens/HoyScreen'
import DespachoScreen from './src/screens/DespachoScreen'
import PreciosScreen from './src/screens/PreciosScreen'
import PuestosScreen from './src/screens/PuestosScreen'
import VendedoresScreen from './src/screens/VendedoresScreen'
import StatsScreen from './src/screens/StatsScreen'
import ReportesScreen from './src/screens/ReportesScreen'
import AdminScreen from './src/screens/AdminScreen'
import NotifScreen from './src/screens/NotifScreen'
import {
  guardarSesion, leerSesion, limpiarSesion, sesionActual, setSesionActual, type Sesion,
} from './src/lib/auth'
import { all, clearStore, hydrateStore, useStoreVersion } from './src/lib/store'
import { setOnNoAutorizado, startSyncLoop, syncPull } from './src/lib/sync'
import { avisarNuevasPendientes, pedirPermisoNotif } from './src/lib/notificar'
import { initOutbox } from './src/lib/outbox'
import { bioActiva, hayBiometria, pedirBiometria, tipoBiometria } from './src/lib/bio'
import { registrarPushToken } from './src/lib/push'
import { navRef } from './src/lib/navRef'
import * as Notifications from 'expo-notifications'
import { Btn, Card, CardBody, Muted } from './src/components/ui'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const TAB_ICON: Record<string, string> = {
  Hoy: '🏠', Despacho: '🚚', Precios: '🏷️', Puestos: '📍',
  Equipo: '👥', Stats: '📊', Reportes: '📈',
}

const conHeader = (ScreenComp: React.ComponentType) => function ConHeader() {
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <Header onSalir={() => (global as { __salir?: () => void }).__salir?.()} />
      <ScreenComp />
    </View>
  )
}

/** tabs del dueño — NAV_DUENIO del web */
function DuenioTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.blurple,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: { backgroundColor: '#ffffffee', borderTopColor: C.border },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 17, opacity: focused ? 1 : 0.5 }}>{TAB_ICON[route.name] ?? '•'}</Text>
        ),
      })}
    >
      <Tab.Screen name="Hoy" component={conHeader(HoyScreen)} />
      <Tab.Screen name="Despacho" component={conHeader(DespachoScreen)} />
      <Tab.Screen name="Precios" component={conHeader(PreciosScreen)} />
      <Tab.Screen name="Puestos" component={conHeader(PuestosScreen)} />
      <Tab.Screen name="Equipo" component={conHeader(VendedoresScreen)} />
      <Tab.Screen name="Stats" component={conHeader(StatsScreen)} />
      <Tab.Screen name="Reportes" component={conHeader(ReportesScreen)} />
    </Tab.Navigator>
  )
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [locked, setLocked] = useState(false)
  const [bioTipo, setBioTipo] = useState('tu biometría')

  // hidratar store + sesión al arrancar — con sesión + biometría activa → lock
  useEffect(() => {
    void (async () => {
      await hydrateStore()
      const s = await leerSesion()
      setSesion(s)
      if (s && (await bioActiva()) && (await hayBiometria())) {
        setBioTipo(await tipoBiometria())
        setLocked(true)
      }
      setBooting(false)
    })()
  }, [])

  // si un pull/push devuelve 401 → cerrar sesión (fuerza Login)
  useEffect(() => {
    setOnNoAutorizado(() => {
      void limpiarSesion().then(() => setSesion(null))
    })
    return () => setOnNoAutorizado(null)
  }, [])

  // sync loop + outbox + permiso de notificaciones + push token al entrar
  useEffect(() => {
    if (!sesion) return
    const stop = startSyncLoop()
    const unsubOutbox = initOutbox()
    void pedirPermisoNotif().then(() => registrarPushToken())
    void avisarNuevasPendientes()
    return () => { stop(); unsubOutbox() }
  }, [sesion])

  // tap en notificación → navegar a la pantalla relevante
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(res => {
      const tipo = (res.notification.request.content.data as { tipo?: string } | undefined)?.tipo
      if (!navRef.isReady()) return
      const rol = sesionActual()?.rol
      const mapa: Record<string, string> = {
        solicitud: 'Hoy', cierre: 'Hoy', stock: 'Precios',
      }
      if (tipo === 'login' && rol === 'admin') navRef.navigate('Admin' as never)
      else if (rol === 'duenio' && mapa[tipo ?? '']) {
        ;(navRef.navigate as (name: string, params: object) => void)('Home', { screen: mapa[tipo!] })
      } else navRef.navigate('Notificaciones' as never)
    })
    return () => sub.remove()
  }, [])

  async function entrar(s: Sesion) {
    await guardarSesion(s)
    setSesion(s)
    void syncPull() // datos frescos recién entra
  }

  async function salir() {
    await limpiarSesion()
    clearStore()
    setSesion(null)
  }
  ;(global as { __salir?: () => void }).__salir = () => void salir()

  if (booting) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: C.paper, justifyContent: 'center' }}>
          <Loading texto="Abriendo TuPuesto…" />
        </View>
      </SafeAreaProvider>
    )
  }

  // lock biométrico — sesión guardada + flag → huella/Face ID antes de entrar
  if (sesion && locked) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: C.paper, justifyContent: 'center', padding: 20 }}>
          <Card><CardBody style={{ alignItems: 'center', gap: 14, paddingVertical: 26 }}>
            <Text style={{ fontSize: 40 }}>🔐</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>TuPuesto</Text>
            <Muted style={{ fontSize: 13, textAlign: 'center' }}>Usá {bioTipo} para entrar.</Muted>
            <Btn onPress={() => void pedirBiometria().then(ok => { if (ok) setLocked(false) })}>
              Ingresá con {bioTipo}
            </Btn>
            <Btn variant="tertiary" onPress={() => { setLocked(false); void limpiarSesion().then(() => setSesion(null)) }}>
              Entrar con PIN
            </Btn>
          </CardBody></Card>
        </View>
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <SesionYAccent sesion={sesion}>
        <NavigationContainer ref={navRef} key={sesion ? `${sesion.rol}:${sesion.id}` : 'login'}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {sesion == null ? (
              <Stack.Screen name="Login">
                {() => <LoginScreen onLogin={entrar} />}
              </Stack.Screen>
            ) : sesion.rol === 'duenio' ? (
              <Stack.Screen name="Home" component={DuenioTabs} />
            ) : sesion.rol === 'vendedor' ? (
              <Stack.Screen name="MiDia" component={conHeader(MiDiaScreen)} />
            ) : (
              <Stack.Screen name="Admin" component={conHeader(AdminScreen)} />
            )}
            <Stack.Screen
              name="Notificaciones"
              component={NotifScreen}
              options={{ presentation: 'modal', headerShown: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="dark" />
      </SesionYAccent>
    </SafeAreaProvider>
  )
}

/** provee el accent del tema según la categoría del dueño de la sesión —
 *  el vendedor hereda la de su dueño; admin → 'otro' (blurple) */
function SesionYAccent({ sesion, children }: { sesion: Sesion | null; children: React.ReactNode }) {
  useStoreVersion()
  const accent = useMemo(() => {
    if (!sesion) return C.blurple
    const u = all('usuarios').find(x => x.id === sesion.id)
    const duenioDelTema =
      u?.rol === 'duenio' ? u
      : u?.rol === 'vendedor' ? all('usuarios').find(d => d.id === u.duenioId)
      : undefined
    return accentDe(duenioDelTema?.categoria)
  }, [sesion])
  void sesionActual() // lectura para suscribir al store
  return <AccentContext.Provider value={accent}>{children}</AccentContext.Provider>
}
