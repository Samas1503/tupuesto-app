import { useState } from 'react'
import { Button, Card, Input, Label, TextField } from '@heroui/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { pushRow, type TablaSync } from '../lib/snake'
import type { Rol } from '../types'
import ResetPin from './ResetPin'

type EntidadReset = 'duenios' | 'vendedores'

/** usuario local que entró bien pero tiene que elegir PIN nuevo (primer ingreso / reseteo) */
interface PendientePin {
  rol: 'duenio' | 'vendedor'
  tabla: EntidadReset & TablaSync
  id: number
}

const ADMIN_DEMO = { email: 'admin@demo.tupuesto', pin: '0000' }

const CREDENCIALES_DEMO: { quien: string; cred: string }[] = [
  { quien: 'Patricio — dueño demo', cred: 'duenio@demo.tupuesto · 0000' },
  { quien: 'Marcos — vendedor', cred: 'marcos@demo.tupuesto · 1234' },
  { quien: 'Alejandra — vendedora', cred: 'alejandra@demo.tupuesto · 2345' },
  { quien: 'Diego — vendedor', cred: 'diego@demo.tupuesto · 3456' },
  { quien: 'Admin del sistema', cred: 'admin@demo.tupuesto · 0000' },
]

/** Login unificado — un solo form email + PIN para dueño, vendedor y admin.
 *  El rol se detecta por el email: primero db.duenios, después db.vendedores
 *  y por último el admin demo (sin tabla). Errores siempre genéricos. */
export default function Login({ onLogin }: { onLogin: (rol: Rol, id: number) => void }) {
  const duenios = useLiveQuery(() => db.duenios.toArray(), []) ?? []
  const vendedores = useLiveQuery(() => db.vendedores.toArray(), []) ?? []

  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const [pendiente, setPendiente] = useState<PendientePin | null>(null)
  const [pinNuevo, setPinNuevo] = useState('')

  // reset: null (oculto) | 'email' (hay que pedir el email porque no sabemos
  // la entidad) | la entidad ya detectada → monta ResetPin
  const [reset, setReset] = useState<null | 'email' | EntidadReset>(null)
  const [resetEmail, setResetEmail] = useState('')
  const [resetError, setResetError] = useState(false)

  /** a qué tabla pertenece un email — null si no existe (o está inactivo/eliminado) */
  function entidadDe(e: string): EntidadReset | null {
    const n = e.trim().toLowerCase()
    if (n === '') return null
    if (duenios.some(d => d.activo && !d.eliminado && d.email?.trim().toLowerCase() === n)) return 'duenios'
    if (vendedores.some(v => v.activo && !v.eliminado && v.email?.trim().toLowerCase() === n)) return 'vendedores'
    return null
  }

  function entrar() {
    const e = email.trim().toLowerCase()
    const p = pin.trim()

    // 1. dueños
    const d = duenios.find(x => x.activo && !x.eliminado && x.email?.trim().toLowerCase() === e)
    if (d) {
      if (d.pin && d.pin !== p) { setError(true); return }
      if (d.debeCambiarPin) { setPendiente({ rol: 'duenio', tabla: 'duenios', id: d.id! }); return }
      onLogin('duenio', d.id!); return
    }

    // 2. vendedores
    const v = vendedores.find(x => x.activo && !x.eliminado && x.email?.trim().toLowerCase() === e)
    if (v) {
      if (v.pin && v.pin !== p) { setError(true); return }
      if (v.debeCambiarPin) { setPendiente({ rol: 'vendedor', tabla: 'vendedores', id: v.id! }); return }
      onLogin('vendedor', v.id!); return
    }

    // 3. admin demo — sin tabla, credenciales fijas
    if (e === ADMIN_DEMO.email && p === ADMIN_DEMO.pin) { onLogin('admin', 0); return }

    setError(true)
  }

  async function elegirPin() {
    const p = pinNuevo.trim()
    if (pendiente == null || p.length < 4) return
    await db[pendiente.tabla].update(pendiente.id, { pin: p, debeCambiarPin: false })
    void pushRow(pendiente.tabla, pendiente.id)
    onLogin(pendiente.rol, pendiente.id)
  }

  function toggleReset() {
    if (reset != null) { cerrarReset(); return }
    const ent = entidadDe(email)
    if (ent) setReset(ent)
    else { setResetEmail(email); setResetError(false); setReset('email') }
  }

  function confirmarResetEmail() {
    const ent = entidadDe(resetEmail)
    if (!ent) { setResetError(true); return }
    setReset(ent)
  }

  function cerrarReset() {
    setReset(null); setResetError(false)
  }

  /* ── primer ingreso: elegir PIN ──────────────────────────────────── */
  if (pendiente != null) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <Card.Header className="px-4 pt-4 pb-0">
            <Card.Title className="text-base">Elegí tu PIN</Card.Title>
            <Card.Description>Es tu primer ingreso — creá un PIN que solo vos sepas.</Card.Description>
          </Card.Header>
          <Card.Content className="px-4 py-3 flex flex-col gap-3">
            <TextField value={pinNuevo} onChange={v => setPinNuevo(v.replace(/\D/g, '').slice(0, 4))}>
              <Label>PIN nuevo (4 dígitos)</Label>
              <Input type="password" inputMode="numeric" placeholder="••••" />
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
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Entrá a TuPuesto</h1>
        <p className="text-sm text-muted">Un solo ingreso para dueños, vendedores y admin.</p>
      </div>

      <Card>
        <Card.Header className="px-4 pt-4 pb-0">
          <Card.Title className="text-base">Ingreso</Card.Title>
          <Card.Description>Entrá con tu email y tu PIN.</Card.Description>
        </Card.Header>
        <Card.Content className="px-4 py-3 flex flex-col gap-3">
          <TextField value={email} onChange={v => { setEmail(v); setError(false) }}>
            <Label>Email</Label>
            <Input type="email" placeholder="tu@correo.com" autoComplete="email" />
          </TextField>
          <TextField value={pin} onChange={v => { setPin(v); setError(false) }}>
            <Label>PIN</Label>
            <Input type="password" inputMode="numeric" maxLength={4} placeholder="••••" />
          </TextField>
          {error && <p className="text-xs text-danger font-semibold">Email o PIN incorrecto.</p>}
          <Button variant="primary" onPress={entrar} isDisabled={email.trim() === '' || pin.trim() === ''}>
            Entrar
          </Button>

          {/* reset de PIN por código de email — discreto, dentro de la misma card */}
          <button
            type="button"
            onClick={toggleReset}
            className="text-xs text-muted/70 underline underline-offset-2 self-center"
          >
            {reset != null ? 'Volver al ingreso' : '¿Olvidaste tu PIN?'}
          </button>

          {/* si el email no identifica la cuenta todavía, se pide antes del ResetPin */}
          {reset === 'email' && (
            <div className="border-t border-dashed border-border pt-3 flex flex-col gap-3">
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
          {(reset === 'duenios' || reset === 'vendedores') && (
            <div className="border-t border-dashed border-border pt-3">
              <ResetPin entidad={reset} onDone={cerrarReset} />
            </div>
          )}
        </Card.Content>
      </Card>

      <Card>
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
    </div>
  )
}
