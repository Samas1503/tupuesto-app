/** Login unificado — email + PIN para dueño, vendedor y admin.
 *  Port de components/Login.tsx + ResetPin.tsx de la web:
 *  - PIN lo verifica el server (loginServer); sin red → fallback local vs pinHash cacheado
 *  - debeCambiarPin → pantalla de elegir PIN propio (pushea solo pin_hash + flag)
 *  - "¿Olvidaste tu PIN?" → código de 6 dígitos por email (/api/request-reset + verify-reset)
 *  La demo (@demo.tupuesto, IndexedDB local) NO se portó — mobile va siempre contra la API. */

import React, { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C } from '../theme'
import { Btn, Card, CardBody, Field, Muted } from '../components/ui'
import { API, loginServer, type Sesion } from '../lib/auth'
import { activarBio, hayBiometria, tipoBiometria } from '../lib/bio'
import { Alert } from 'react-native'
import { all, put, update } from '../lib/store'
import { hashPin } from '../lib/pin'
import { syncPush } from '../lib/sync'
import type { Rol, Usuario } from '../types'

type ResetPaso = null | 'email' | 'codigo' | 'listo'

export default function LoginScreen({ onLogin }: { onLogin: (s: Sesion) => void }) {
  const insets = useSafeAreaInsets()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const [pendiente, setPendiente] = useState<Usuario | null>(null)
  const [pinNuevo, setPinNuevo] = useState('')

  // reset por código de 6 dígitos — flujo inline como en web
  const [reset, setReset] = useState<ResetPaso>(null)
  const [resetEmail, setResetEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [resetPin, setResetPin] = useState('')
  const [resetMsg, setResetMsg] = useState('')

  /** tras un login exitoso: si el device tiene biometría, ofrecer activarla */
  async function ofrecerBiometria() {
    if (!(await hayBiometria())) return
    const tipo = await tipoBiometria()
    Alert.alert(
      'Ingreso biométrico',
      `¿Querés entrar con ${tipo} la próxima vez?`,
      [
        { text: 'No, gracias', style: 'cancel' },
        { text: `Activar ${tipo}`, onPress: () => void activarBio() },
      ],
    )
  }

  /** usuario activo por email — cache local (para fallback offline) */
  function usuarioDe(e: string): Usuario | undefined {
    const n = e.trim().toLowerCase()
    if (n === '') return undefined
    return all('usuarios').find(
      u => u.activo && !u.eliminado && u.email?.trim().toLowerCase() === n,
    )
  }

  async function entrar() {
    const e = email.trim().toLowerCase()
    const p = pin.trim()
    if (!e || !p || cargando) return
    setCargando(true)
    setError('')
    try {
      const { usuario } = await loginServer(e, p)
      const pinOffline = await hashPin(p)
      // copia local con pinHash propio → permite verificar offline después
      put('usuarios', {
        id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, email: usuario.email,
        debeCambiarPin: usuario.debeCambiarPin, duenioId: usuario.duenioId,
        categoria: usuario.categoria as Usuario['categoria'], plan: usuario.plan,
        pinHash: pinOffline, activo: true,
      } as Usuario)
      if (usuario.debeCambiarPin) {
        setPendiente({ id: usuario.id, rol: usuario.rol } as Usuario)
        return
      }
      await ofrecerBiometria()
      onLogin({ rol: usuario.rol as Rol, id: usuario.id })
      return
    } catch (err) {
      // error del server (4xx/5xx) → PIN incorrecto, no cae al fallback
      const esErrorRed = err instanceof TypeError
      if (!esErrorRed) {
        setError('Email o PIN incorrecto.')
        return
      }
      // sin red → verificación local contra la copia cacheada (exige pinHash previo)
      const u = usuarioDe(e)
      if (u?.pinHash && u.pinHash === (await hashPin(p))) {
        if (u.debeCambiarPin) { setPendiente(u); return }
        await ofrecerBiometria()
        onLogin({ rol: u.rol, id: u.id! })
        return
      }
      setError('Sin conexión y sin sesión previa en este dispositivo.')
    } finally {
      setCargando(false)
    }
  }

  async function elegirPin() {
    const p = pinNuevo.trim()
    if (pendiente == null || p.length < 4) return
    const h = await hashPin(p)
    update('usuarios', pendiente.id!, { pinHash: h, debeCambiarPin: false })
    // el server solo acepta pin_hash + debe_cambiar_pin en la fila propia (403 si vienen más)
    void syncPush('usuarios', [{ id: pendiente.id, pin_hash: h, debe_cambiar_pin: false }]).catch(() => {})
    onLogin({ rol: pendiente.rol, id: pendiente.id! })
  }

  async function pedirCodigo() {
    const e = resetEmail.trim().toLowerCase()
    if (!e || cargando) return
    setCargando(true)
    setResetMsg('')
    try {
      await fetch(`${API}/api/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      })
      setReset('codigo')
    } catch {
      setResetMsg('No pudimos mandar el código — fijate tu conexión y probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  async function verificarCodigo() {
    if (codigo.trim().length !== 6 || resetPin.trim().length < 4 || cargando) return
    setCargando(true)
    setResetMsg('')
    try {
      const r = await fetch(`${API}/api/verify-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail.trim().toLowerCase(), codigo: codigo.trim(), nuevoPin: resetPin.trim() }),
      })
      if (!r.ok) { setResetMsg('Código inválido o vencido.'); return }
      setReset('listo')
    } catch {
      setResetMsg('Código inválido o vencido.')
    } finally {
      setCargando(false)
    }
  }

  /* ── primer ingreso: elegir PIN propio ── */
  if (pendiente != null) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.paper }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, gap: 18, paddingTop: insets.top + 20 }}>
        <Marca />
        <Card>
          <CardBody>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>Elegí tu PIN</Text>
            <Muted style={{ fontSize: 13 }}>Es tu primer ingreso — creá un PIN que solo vos sepas.</Muted>
            <Field label="PIN nuevo (4 a 8 dígitos)" value={pinNuevo} onChange={v => setPinNuevo(v.replace(/\D/g, '').slice(0, 8))} secure numeric placeholder="••••" />
            <Btn onPress={elegirPin} disabled={pinNuevo.trim().length < 4}>Guardar y entrar</Btn>
          </CardBody>
        </Card>
      </ScrollView>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, gap: 18, paddingTop: insets.top + 20 }} keyboardShouldPersistTaps="handled">
        <Marca />
        <View style={{ alignSelf: 'center', backgroundColor: '#635bff1a', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: C.blurple }}>● Tu negocio al día — sin planillas</Text>
        </View>

        <Card>
          <CardBody>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.navy }}>
              {reset == null ? 'Ingreso' : 'Recuperar PIN'}
            </Text>
            <Muted style={{ fontSize: 13 }}>
              {reset == null ? 'Entrá con tu email y tu PIN.' : 'Te mandamos un código por email para elegir un PIN nuevo.'}
            </Muted>

            {reset == null && (
              <>
                <Field label="Email" value={email} onChange={v => { setEmail(v); setError('') }} placeholder="tu@correo.com" />
                <Field label="PIN" value={pin} onChange={v => { setPin(v.replace(/\D/g, '').slice(0, 8)); setError('') }} secure numeric placeholder="PIN de 4 a 8 dígitos" />
                {error !== '' && <Text style={{ fontSize: 12, fontWeight: '700', color: C.danger }}>{error}</Text>}
                <Btn onPress={entrar} disabled={email.trim() === '' || pin.trim() === '' || cargando}>
                  {cargando ? 'Entrando…' : 'Entrar'}
                </Btn>
              </>
            )}

            <Text
              onPress={() => {
                if (reset != null) { setReset(null); setResetMsg(''); return }
                setResetEmail(email)
                setReset('email')
              }}
              style={{ fontSize: 12, color: C.muted, textDecorationLine: 'underline', alignSelf: 'center', opacity: 0.8 }}
            >
              {reset != null ? 'Volver al ingreso' : '¿Olvidaste tu PIN?'}
            </Text>

            {reset === 'email' && (
              <>
                <Field label="Email" value={resetEmail} onChange={v => { setResetEmail(v); setResetMsg('') }} placeholder="tu@correo.com" />
                {resetMsg !== '' && <Text style={{ fontSize: 12, fontWeight: '700', color: C.danger }}>{resetMsg}</Text>}
                <Btn sm onPress={pedirCodigo} disabled={cargando || resetEmail.trim() === ''}>
                  {cargando ? 'Mandando…' : 'Mandar código'}
                </Btn>
              </>
            )}

            {reset === 'codigo' && (
              <>
                <Muted style={{ fontSize: 12 }}>
                  Te mandamos un código a <Text style={{ fontWeight: '700', color: C.navy }}>{resetEmail.trim().toLowerCase()}</Text> — revisá spam si no aparece.
                </Muted>
                <Field label="Código (6 dígitos)" value={codigo} onChange={v => { setCodigo(v.replace(/\D/g, '').slice(0, 6)); setResetMsg('') }} numeric placeholder="••••••" />
                <Field label="PIN nuevo (4 a 8 dígitos)" value={resetPin} onChange={v => { setResetPin(v.replace(/\D/g, '').slice(0, 8)); setResetMsg('') }} secure numeric placeholder="••••" />
                {resetMsg !== '' && <Text style={{ fontSize: 12, fontWeight: '700', color: C.danger }}>{resetMsg}</Text>}
                <Btn sm onPress={verificarCodigo} disabled={cargando || codigo.trim().length !== 6 || resetPin.trim().length < 4}>
                  {cargando ? 'Verificando…' : 'Cambiar PIN'}
                </Btn>
              </>
            )}

            {reset === 'listo' && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.success }}>PIN cambiado — ya podés entrar</Text>
                <Btn sm onPress={() => { setReset(null); setCodigo(''); setResetPin('') }}>Listo</Btn>
              </>
            )}
          </CardBody>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Marca() {
  return (
    <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ height: 42, width: 42, borderRadius: 11, backgroundColor: C.blurple, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 19 }}>TP</Text>
      </View>
      <Text style={{ fontSize: 30, fontWeight: '800', color: C.navy, letterSpacing: -0.8 }}>
        Tu<Text style={{ color: C.blurple }}>P</Text>uesto
      </Text>
    </View>
  )
}
