import { useState } from 'react'
import { Button, Card, Input, Label, TextField } from '@heroui/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { pushRow } from '../lib/snake'
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
    const u = usuarioDe(e)
    if (u) {
      // sin pinHash todavía (alta vieja sin migrar) no bloquea el ingreso
      if (u.pinHash && u.pinHash !== (await hashPin(p))) { setError(true); return }
      if (u.debeCambiarPin) { setPendiente(u); return }
      onLogin(u.rol, u.id!); return
    }
    setError(true)
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
          {reset === 'ok' && (
            <div className="border-t border-dashed border-border pt-3">
              <ResetPin onDone={cerrarReset} />
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
