import { useState } from 'react'
import { Button, Card, Input, Label, TextField } from '@heroui/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { seedDemoAccesos } from '../db'
import { pushRow } from '../lib/snake'
import { loginServer } from '../lib/auth'
import { hashPin } from '../lib/pin'
import type { Rol, Usuario } from '../types'
import ResetPin from './ResetPin'

const CREDENCIALES_DEMO: { quien: string; cred: string }[] = [
  { quien: 'Patricio — dueño demo', cred: 'duenio@demo.tupuesto · 0000' },
  { quien: 'Marcos — vendedor', cred: 'marcos@demo.tupuesto · 1234' },
  { quien: 'Alejandra — vendedora', cred: 'alejandra@demo.tupuesto · 2345' },
  { quien: 'Diego — vendedor', cred: 'diego@demo.tupuesto · 3456' },
  { quien: 'Admin del sistema', cred: 'admin@demo.tupuesto · 0000' },
]

/** Login unificado — un solo form email + PIN para dueño, vendedor y admin.
 *  El rol lo trae la fila de `usuarios` (incluye al admin — ya no es hardcode).
 *  El PIN se compara como hash: SHA-256(pin) vs usuario.pinHash. Errores genéricos. */
export default function Login({ onLogin }: { onLogin: (rol: Rol, id: number) => void }) {
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []

  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const [pendiente, setPendiente] = useState<Usuario | null>(null)
  const [pinNuevo, setPinNuevo] = useState('')

  // reset: null (oculto) | 'email' (hay que pedir el email porque todavía no
  // sabemos si existe la cuenta) | 'ok' (email validado → monta ResetPin)
  const [reset, setReset] = useState<null | 'email' | 'ok'>(null)
  const [resetEmail, setResetEmail] = useState('')
  const [resetError, setResetError] = useState(false)

  /** usuario activo por email — null si no existe (o está inactivo/eliminado) */
  function usuarioDe(e: string): Usuario | undefined {
    const n = e.trim().toLowerCase()
    if (n === '') return undefined
    return usuarios.find(u => u.activo && !u.eliminado && u.email?.trim().toLowerCase() === n)
  }

  async function entrar() {
    const e = email.trim().toLowerCase()
    const p = pin.trim()
    // la demo vive solo en IndexedDB — re-siembra los accesos demo si el pull los borró
    let u = usuarioDe(e)
    if (!u && e.endsWith('@demo.tupuesto')) {
      await seedDemoAccesos()
      u = await db.usuarios.where('email').equals(e).first()
    }
    if (u?.email?.endsWith('@demo.tupuesto')) {
      // demo — verificación local, sin server
      if (u.pinHash && u.pinHash !== (await hashPin(p))) { setError(true); return }
      if (u.debeCambiarPin) { setPendiente(u); return }
      onLogin(u.rol, u.id!); return
    }
    // usuarios reales — el PIN lo verifica el server; si no hay red, fallback local
    try {
      const { usuario } = await loginServer(e, p)
      const pinOffline = await hashPin(p)
      // el server devuelve el pinHash propio para verificar offline después
      await db.usuarios.put({
        id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, email: usuario.email,
        debeCambiarPin: usuario.debeCambiarPin, duenioId: usuario.duenioId,
        categoria: usuario.categoria as any, plan: usuario.plan,
        pinHash: pinOffline, activo: true, // hash local para verificar offline
      } as Usuario)
      localStorage.setItem('tp-login-at', String(Date.now()))
      if (usuario.debeCambiarPin) { setPendiente({ id: usuario.id, rol: usuario.rol } as Usuario); return }
      onLogin(usuario.rol, usuario.id); return
    } catch (err) {
      // si el server respondió (4xx/5xx — p.ej. 401 "Email o PIN incorrectos") no es
      // offline: mostrar error sin caer al fallback local
      const esErrorRed = err instanceof TypeError ||
        (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError'))
      if (!esErrorRed) { setError(true); return }
      // sin red → verificación local contra la copia en Dexie; exige pinHash previo
      // (tras un pull el server strippea pinHash — sin hash local no hay login offline)
      if (u?.pinHash && u.pinHash === (await hashPin(p))) {
        if (u.debeCambiarPin) { setPendiente(u); return }
        localStorage.setItem('tp-login-at', String(Date.now()))
        onLogin(u.rol, u.id!); return
      }
      setError(true)
    }
  }

  async function elegirPin() {
    const p = pinNuevo.trim()
    if (pendiente == null || p.length < 4) return
    await db.usuarios.update(pendiente.id!, { pinHash: await hashPin(p), debeCambiarPin: false })
    void pushRow('usuarios', pendiente.id!)
    onLogin(pendiente.rol, pendiente.id!)
  }

  function toggleReset() {
    if (reset != null) { cerrarReset(); return }
    if (usuarioDe(email)) setReset('ok')
    else { setResetEmail(email); setResetError(false); setReset('email') }
  }

  function confirmarResetEmail() {
    if (!usuarioDe(resetEmail)) { setResetError(true); return }
    setReset('ok')
  }

  function cerrarReset() {
    setReset(null); setResetError(false)
  }

  /* ── primer ingreso: elegir PIN ──────────────────────────────────── */
  if (pendiente != null) {
    return (
      <div className="relative min-h-dvh flex flex-col items-center justify-center gap-6 px-4 overflow-hidden">
        <Blobs />
        <Marca />
        <Card className="w-full max-w-[380px] !rounded-3xl !shadow-xl !shadow-navy/10 relative z-10">
          <Card.Header className="px-4 pt-4 pb-0">
            <Card.Title className="text-base">Elegí tu PIN</Card.Title>
            <Card.Description>Es tu primer ingreso — creá un PIN que solo vos sepas.</Card.Description>
          </Card.Header>
          <Card.Content className="px-4 py-3 flex flex-col gap-3">
            <TextField value={pinNuevo} onChange={v => setPinNuevo(v.replace(/\D/g, '').slice(0, 8))}>
              <Label>PIN nuevo (4 dígitos)</Label>
              <Input type="password" inputMode="numeric" placeholder="PIN de 4 a 8 dígitos" />
            </TextField>
            <Button variant="primary" onPress={elegirPin} isDisabled={pinNuevo.trim().length < 4}>
              Guardar y entrar
            </Button>
          </Card.Content>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center gap-6 px-4 overflow-hidden">
      <Blobs />
      <Marca />

      <span className="inline-flex items-center gap-2 rounded-full bg-accent/10 text-accent text-xs font-bold px-3.5 py-1.5 relative z-10">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        Tu negocio al día — sin planillas
      </span>

      <Card className="w-full max-w-[380px] !rounded-3xl !shadow-xl !shadow-navy/10 relative z-10">
        <Card.Header className="px-4 pt-4 pb-0">
          <Card.Title className="text-base">{reset == null ? 'Ingreso' : 'Recuperar PIN'}</Card.Title>
          <Card.Description>
            {reset == null ? 'Entrá con tu email y tu PIN.' : 'Te mandamos un código por email para elegir un PIN nuevo.'}
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-4 py-3 flex flex-col gap-3">
          {/* un solo formulario a la vez: ingreso o recuperación */}
          {reset == null && <>
          <TextField value={email} onChange={v => { setEmail(v); setError(false) }}>
            <Label>Email</Label>
            <Input type="email" placeholder="tu@correo.com" autoComplete="email" />
          </TextField>
          <TextField value={pin} onChange={v => { setPin(v); setError(false) }}>
            <Label>PIN</Label>
            <Input type="password" inputMode="numeric" maxLength={8} placeholder="PIN de 4 a 8 dígitos" />
          </TextField>
          {error && <p className="text-xs text-danger font-semibold">Email o PIN incorrecto.</p>}
          <Button variant="primary" onPress={entrar} isDisabled={email.trim() === '' || pin.trim() === ''}
            className="anim-shine !h-11">
            Entrar
          </Button>
          </>}

          <button
            type="button"
            onClick={toggleReset}
            className="text-xs text-muted/70 underline underline-offset-2 self-center"
          >
            {reset != null ? 'Volver al ingreso' : '¿Olvidaste tu PIN?'}
          </button>

          {reset === 'email' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted">Ingresá tu email para encontrar tu cuenta.</p>
              <TextField value={resetEmail} onChange={v => { setResetEmail(v); setResetError(false) }}>
                <Label>Email</Label>
                <Input type="email" placeholder="tu@correo.com" autoComplete="email" />
              </TextField>
              {resetError && <p className="text-xs text-danger font-semibold">No encontramos una cuenta con ese email.</p>}
              <Button variant="primary" size="sm" onPress={confirmarResetEmail} isDisabled={resetEmail.trim() === ''}>
                Continuar
              </Button>
            </div>
          )}
          {reset === 'ok' && <ResetPin onDone={cerrarReset} />}
        </Card.Content>
      </Card>

      {new URLSearchParams(location.search).has('demo') && (
      <Card className="w-full max-w-[380px] !rounded-3xl relative z-10 !bg-white/80 backdrop-blur">
        <Card.Content className="px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Credenciales de la demo</p>
          <ul className="flex flex-col gap-1.5 text-xs num">
            {CREDENCIALES_DEMO.map(c => (
              <li key={c.cred} className="flex justify-between gap-2">
                <span className="text-muted">{c.quien}</span><b>{c.cred}</b>
              </li>
            ))}
          </ul>
        </Card.Content>
      </Card>
      )}
    </div>
  )
}

/* ── piezas de marca estilo landing ─────────────────────────────── */
function Blobs() {
  return (
    <>
      <div className="blob" style={{ width: 340, height: 340, top: '-8%', left: '-12%', background: 'radial-gradient(circle, rgba(99,91,255,.22), transparent 70%)' }} />
      <div className="blob" style={{ width: 300, height: 300, bottom: '-10%', right: '-10%', background: 'radial-gradient(circle, rgba(11,165,236,.16), transparent 70%)', animationDelay: '-4s' }} />
    </>
  )
}

function Marca() {
  return (
    <div className="relative z-10 flex items-center gap-2.5 anim-floaty">
      <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="TuPuesto" className="h-11 w-11" />
      <span className="text-3xl font-extrabold tracking-tight text-navy">
        Tu<span className="text-accent">P</span>uesto
      </span>
    </div>
  )
}
