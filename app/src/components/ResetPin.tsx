import { useState } from 'react'
import { Button, Input, Label, TextField } from '@heroui/react'

// api de Vercel (funciones en /api) — en dev local apunta al vercel dev server
const API = location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://tupuesto.vercel.app'

type Paso = 'email' | 'codigo' | 'listo'

/** Reset de PIN por código de 6 dígitos mandado por email — inline (no modal).
 *  Paso 1: email → POST /api/request-reset. Paso 2: código + PIN nuevo → POST
 *  /api/verify-reset. Paso 3: listo. Una sola tabla `usuarios` — sin `entidad`. */
export default function ResetPin({ onDone }: { onDone?: () => void }) {
  const [paso, setPaso] = useState<Paso>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [pinNuevo, setPinNuevo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  const emailNorm = email.trim().toLowerCase()

  async function pedirCodigo() {
    if (emailNorm === '' || cargando) return
    setCargando(true); setError('')
    try {
      // el api responde siempre ok genérico — no revela si el email existe
      await fetch(`${API}/api/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNorm }),
      })
      setPaso('codigo')
    } catch {
      setError('No pudimos mandar el código — fijate tu conexión y probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  async function verificar() {
    if (codigo.trim().length !== 6 || pinNuevo.trim().length < 4 || pinNuevo.trim().length > 8 || cargando) return
    setCargando(true); setError('')
    try {
      const r = await fetch(`${API}/api/verify-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNorm, codigo: codigo.trim(), nuevoPin: pinNuevo.trim() }),
      })
      if (!r.ok) { setError('Código inválido o vencido'); return }
      setPaso('listo')
    } catch {
      setError('Código inválido o vencido')
    } finally {
      setCargando(false)
    }
  }

  function listo() {
    // resetea todo para que una próxima apertura arranque de cero
    setPaso('email'); setEmail(''); setCodigo(''); setPinNuevo(''); setError('')
    onDone?.()
  }

  if (paso === 'listo') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-success">PIN cambiado — ya podés entrar</p>
        <Button variant="primary" size="sm" onPress={listo}>Listo</Button>
      </div>
    )
  }

  if (paso === 'codigo') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Recuperar PIN</p>
        <p className="text-xs text-muted">
          Te mandamos un código a <b className="text-foreground">{emailNorm}</b> — revisá spam si no aparece.
        </p>
        <TextField value={codigo} onChange={v => { setCodigo(v.replace(/\D/g, '').slice(0, 6)); setError('') }}>
          <Label>Código (6 dígitos)</Label>
          <Input inputMode="numeric" maxLength={6} placeholder="••••••" autoComplete="one-time-code" />
        </TextField>
        <TextField value={pinNuevo} onChange={v => { setPinNuevo(v.replace(/\D/g, '').slice(0, 8)); setError('') }}>
          <Label>PIN nuevo (4 dígitos)</Label>
          <Input type="password" inputMode="numeric" maxLength={8} placeholder="••••" />
        </TextField>
        {error !== '' && <p className="text-xs text-danger font-semibold">{error}.</p>}
        <Button variant="primary" size="sm" onPress={verificar} isDisabled={cargando || codigo.trim().length !== 6 || pinNuevo.trim().length < 4 || pinNuevo.trim().length > 8}>
          {cargando ? 'Verificando…' : 'Cambiar PIN'}
        </Button>
        <button
          type="button"
          onClick={() => { setPaso('email'); setCodigo(''); setPinNuevo(''); setError('') }}
          className="text-xs text-muted/70 underline underline-offset-2 self-center"
        >
          Usar otro email
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">Recuperar PIN</p>
      <p className="text-xs text-muted">Te mandamos un código de 6 dígitos por email para elegir un PIN nuevo.</p>
      <TextField value={email} onChange={v => { setEmail(v); setError('') }}>
        <Label>Email</Label>
        <Input type="email" placeholder="tu@correo.com" autoComplete="email" />
      </TextField>
      {error !== '' && <p className="text-xs text-danger font-semibold">{error}</p>}
      <Button variant="primary" size="sm" onPress={pedirCodigo} isDisabled={cargando || emailNorm === ''}>
        {cargando ? 'Mandando…' : 'Mandar código'}
      </Button>
    </div>
  )
}
