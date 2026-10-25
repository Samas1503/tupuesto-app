import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Button, Card, Checkbox, Chip, Input, Label, TextField } from '@heroui/react'
import { fmtMoney } from '../lib/format'
import {
  enviarFirma, getContratoPorToken, marcarVisto, pedirOtp, verificarOtp,
  type Contrato, type ResultadoFirma,
} from '../lib/contratos'

type Paso =
  | 'cargando'      // trayendo el contrato por token
  | 'error'         // token ausente / contrato no encontrado / API caída
  | 'visto'         // contrato visible, falta pedir el código
  | 'otp-enviado'   // código enviado al email — input de 6 dígitos
  | 'otp-ok'        // código aceptado — canvas habilitado
  | 'firmando'      // POST en curso
  | 'firmado'       // confirmación final

function fmtFechaC(v?: string | number): string {
  if (v == null) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Cuerpo de respaldo — solo se usa si la API no devuelve el contrato ya
 *  renderizado por la plantilla canónica (T03). */
function plantillaFallback(c: Contrato): string {
  return `CONTRATO DE SUSCRIPCIÓN DE SERVICIO — TUPUESTO

Entre TuPuesto (en adelante "el Proveedor") y ${c.razonSocial || 'el suscriptor'}, CUIT ${c.cuit || '—'}, con domicilio electrónico constituido en ${c.email || '—'} (en adelante "el Suscriptor"), se acuerda:

1. OBJETO. El Proveedor otorga al Suscriptor acceso a la plataforma TuPuesto de control de puestos y rendición diaria, bajo el plan "${c.plan || '—'}" por un precio de ${fmtMoney(c.precio)} mensuales.

2. DOMICILIO ELECTRÓNICO (art. 75 CPCCN). El email declarado constituye domicilio electrónico válido a los fines de notificaciones entre las partes.

3. MEDIO ELECTRÓNICO. El Suscriptor consiente celebrar este contrato por medio electrónico y reconoce la firma electrónica simple como válida (Ley 25.506).

4. VALIDACIÓN DE LA FIRMA. La identidad del firmante se verifica mediante un código de un solo uso enviado a su domicilio electrónico, junto con el trazo de firma capturado y la aceptación expresa del presente documento. El contrato y su evidencia quedan registrados con fecha cierta y se envía copia al Suscriptor por email.

5. VIGENCIA Y CANCELACIÓN. La suscripción se renueva mes a mes y puede cancelarse en cualquier momento sin permanencia mínima.

Fecha de emisión: ${fmtFechaC(c.createdAt)}.`
}

/** Página pública `/app/firmar?token=…` — sin sesión. El firmante ve el
 *  contrato, valida su identidad con un código OTP que llega por email,
 *  dibuja su firma en el canvas y acepta → POST /api/firmar. */
export default function FirmarContrato() {
  const token = new URLSearchParams(location.search).get('token')?.trim() ?? ''

  const [paso, setPaso] = useState<Paso>(token === '' ? 'error' : 'cargando')
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [error, setError] = useState<string | null>(
    token === '' ? 'Falta el token del contrato en el link.' : null,
  )

  // OTP
  const [codigo, setCodigo] = useState('')
  const [otpError, setOtpError] = useState<string | null>(null)
  const [enviandoOtp, setEnviandoOtp] = useState(false)
  const [verificando, setVerificando] = useState(false)

  // firma
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [firmaVacia, setFirmaVacia] = useState(true)
  const [acepto, setAcepto] = useState(false)
  const [firmaError, setFirmaError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoFirma | null>(null)

  useEffect(() => {
    if (token === '') return // sin token — el estado inicial ya es 'error'
    let vivo = true
    getContratoPorToken(token)
      .then(c => {
        if (!vivo) return
        setContrato(c)
        setPaso(c.estado === 'firmado' ? 'firmado' : 'visto')
        // audit trail: documento_visto (fire-and-forget — nunca bloquea la UI)
        if (c.estado !== 'firmado') marcarVisto(token).catch(() => {})
      })
      .catch(e => {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudo cargar el contrato')
        setPaso('error')
      })
    return () => { vivo = false }
  }, [token])

  async function pedirCodigo() {
    setEnviandoOtp(true); setOtpError(null)
    try {
      await pedirOtp(token, contrato?.email)
      setCodigo('') // el código anterior queda obsoleto
      setPaso('otp-enviado')
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : 'No se pudo enviar el código')
    } finally {
      setEnviandoOtp(false)
    }
  }

  async function validarCodigo() {
    const c = codigo.trim()
    if (!/^\d{6}$/.test(c)) { setOtpError('El código tiene 6 dígitos.'); return }
    setVerificando(true); setOtpError(null)
    try {
      await verificarOtp(token, contrato?.email, c)
      setPaso('otp-ok')
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : 'Código inválido o vencido')
    } finally {
      setVerificando(false)
    }
  }

  async function firmar() {
    const cv = canvasRef.current
    if (!cv || firmaVacia || !acepto || paso !== 'otp-ok') return
    setPaso('firmando'); setFirmaError(null)
    try {
      const res = await enviarFirma({
        token,
        email: contrato?.email,
        codigo: codigo.trim(),
        firma: cv.toDataURL('image/png'),
      })
      setResultado(res)
      setPaso('firmado')
      setContrato(c => (c ? { ...c, estado: 'firmado' } : c))
    } catch (e) {
      setFirmaError(e instanceof Error ? e.message : 'No se pudo firmar — probá de nuevo')
      setPaso('otp-ok') // vuelve al paso de firma sin perder el canvas
    }
  }

  const yaFirmado = contrato?.estado === 'firmado'
  const puedeFirmar = paso === 'otp-ok' && !firmaVacia && acepto
  const textoContrato = contrato?.texto ?? (contrato ? plantillaFallback(contrato) : '')

  return (
    <div className="min-h-dvh bg-paper text-navy">
      {/* marca — mismo lenguaje que el login */}
      <header className="max-w-lg mx-auto px-4 pt-6 pb-2 flex items-center gap-2.5">
        <div
          className="h-9 w-9 rounded-[10px] shrink-0 bg-accent"
          style={{
            WebkitMaskImage: `url(${import.meta.env.BASE_URL}icon.svg)`,
            maskImage: `url(${import.meta.env.BASE_URL}icon.svg)`,
            WebkitMaskSize: 'contain', maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center', maskPosition: 'center',
          }}
          role="img" aria-label="TuPuesto"
        />
        <span className="font-extrabold tracking-tight text-2xl leading-none text-navy">
          Tu<span className="text-accent">Puesto</span>
        </span>
      </header>

      <main className="max-w-lg mx-auto px-4 pb-10 pt-2 flex flex-col gap-4">
        {paso === 'cargando' && (
          <Card><Card.Content className="p-5"><p className="text-sm text-muted">Cargando el contrato…</p></Card.Content></Card>
        )}

        {paso === 'error' && (
          <Card>
            <Card.Header className="px-4 pt-4 pb-0"><Card.Title className="text-base">No se pudo abrir el contrato</Card.Title></Card.Header>
            <Card.Content className="px-4 py-3">
              <p className="text-sm text-muted">{error}</p>
              <p className="text-xs text-muted mt-2">Revisá que el link esté completo o pedí que te lo reenvíen.</p>
            </Card.Content>
          </Card>
        )}

        {contrato != null && paso !== 'error' && paso !== 'cargando' && (<>
          {/* ── encabezado del contrato ── */}
          <Card>
            <Card.Header className="px-4 pt-4 pb-0">
              <div className="flex items-start justify-between gap-3 w-full">
                <div className="min-w-0">
                  <Card.Title className="text-base">Contrato de suscripción</Card.Title>
                  <Card.Description>
                    {contrato.razonSocial} · CUIT {contrato.cuit || '—'}
                  </Card.Description>
                </div>
                <Chip size="sm" variant="soft" color={yaFirmado ? 'success' : 'warning'} className="shrink-0">
                  {yaFirmado ? 'firmado' : 'pendiente de firma'}
                </Chip>
              </div>
            </Card.Header>
            <Card.Content className="px-4 py-3">
              <p className="text-xs text-muted num">
                {contrato.plan}{contrato.precio ? ` · ${fmtMoney(contrato.precio)}/mes` : ''}
                {' · '}emitido {fmtFechaC(contrato.createdAt)}
                {contrato.firmadoAt ? ` · firmado ${fmtFechaC(contrato.firmadoAt)}` : ''}
              </p>
            </Card.Content>
          </Card>

          {/* ── cuerpo del contrato ── */}
          <Card>
            <Card.Content className="p-4">
              <pre className="whitespace-pre-wrap font-sans text-[0.8rem] leading-relaxed text-navy/90">
                {textoContrato}
              </pre>
            </Card.Content>
          </Card>

          {yaFirmado ? (
            <Card>
              <Card.Content className="p-5 flex flex-col items-center gap-2 text-center">
                <span className="h-11 w-11 rounded-full bg-success/15 text-success grid place-items-center text-xl font-extrabold">✓</span>
                <p className="font-bold">{paso === 'firmado' && !resultado ? 'Este contrato ya fue firmado' : 'Contrato firmado'}</p>
                <p className="text-sm text-muted">
                  {resultado?.copiaEnviada === false
                    ? 'El contrato quedó firmado — la copia por email se está enviando.'
                    : 'La copia firmada y su evidencia fueron enviadas al email del suscriptor.'}
                </p>
                {resultado?.pdfHash && (
                  <p className="text-[0.65rem] text-muted num break-all mt-1">
                    SHA-256 del documento: {resultado.pdfHash}
                    {resultado.anclaje === 'pendiente' ? ' · anclaje de timestamp en proceso' : ''}
                  </p>
                )}
              </Card.Content>
            </Card>
          ) : (<>
            {/* ── paso 1: OTP ── */}
            <Card>
              <Card.Header className="px-4 pt-4 pb-0">
                <Card.Title className="text-base">1 · Verificá tu identidad</Card.Title>
                <Card.Description>
                  Te enviamos un código de 6 dígitos a <b>{contrato.email || 'tu email'}</b>.
                </Card.Description>
              </Card.Header>
              <Card.Content className="px-4 py-3 flex flex-col gap-3">
                {(paso === 'visto' || paso === 'otp-enviado') && (
                  <Button variant={paso === 'otp-enviado' ? 'tertiary' : 'primary'} onPress={pedirCodigo} isDisabled={enviandoOtp}>
                    {enviandoOtp ? 'Enviando…' : paso === 'otp-enviado' ? 'Reenviar código' : 'Enviar código'}
                  </Button>
                )}
                {paso === 'otp-enviado' && (
                  <div className="flex flex-col gap-2">
                    <TextField value={codigo} onChange={v => { setCodigo(v.replace(/\D/g, '').slice(0, 6)); setOtpError(null) }}>
                      <Label>Código</Label>
                      <Input inputMode="numeric" maxLength={6} placeholder="6 dígitos" autoComplete="one-time-code" />
                    </TextField>
                    <Button variant="primary" size="sm" onPress={validarCodigo} isDisabled={codigo.length !== 6 || verificando}>
                      {verificando ? 'Validando…' : 'Validar código'}
                    </Button>
                  </div>
                )}
                {paso === 'otp-ok' || paso === 'firmando' ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-success">✓ Código verificado — ya podés firmar abajo.</p>
                    {/* por si el código quedó consumido o venció al enviar la firma */}
                    <button type="button" onClick={() => void pedirCodigo()}
                      className="text-xs text-muted/70 underline underline-offset-2 shrink-0">
                      Reenviar
                    </button>
                  </div>
                ) : null}
                {otpError != null && <p className="text-xs text-danger font-semibold">{otpError}</p>}
              </Card.Content>
            </Card>

            {/* ── paso 2: firma ── */}
            <Card>
              <Card.Header className="px-4 pt-4 pb-0">
                <Card.Title className="text-base">2 · Firmá</Card.Title>
                <Card.Description>
                  {paso === 'otp-ok' || paso === 'firmando'
                    ? 'Dibujá tu firma con el dedo o el mouse.'
                    : 'Primero validá el código — después se habilita el espacio para firmar.'}
                </Card.Description>
              </Card.Header>
              <Card.Content className="px-4 py-3 flex flex-col gap-2">
                <PadFirma
                  canvasRef={canvasRef}
                  habilitado={paso === 'otp-ok'}
                  onTrazo={() => setFirmaVacia(false)}
                  onBorrar={() => setFirmaVacia(true)}
                />
                {firmaError != null && <p className="text-xs text-danger font-semibold">{firmaError}</p>}
              </Card.Content>
            </Card>

            {/* ── paso 3: aceptar + enviar ── */}
            <Card>
              <Card.Content className="p-4 flex flex-col gap-3">
                <Checkbox isSelected={acepto} onChange={setAcepto} isDisabled={paso !== 'otp-ok'}>
                  <Checkbox.Content>
                    <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                    <span className="text-sm">Leí y acepto el contrato</span>
                  </Checkbox.Content>
                </Checkbox>
                <Button variant="primary" onPress={firmar} isDisabled={paso === 'firmando' || !puedeFirmar} className="anim-shine !h-11">
                  {paso === 'firmando' ? 'Firmando…' : 'Firmar contrato'}
                </Button>
                <p className="text-[0.7rem] text-muted leading-snug">
                  Firma capturada con consentimiento — documento con validez electrónica (Ley 25.506 art. 5º).
                  El contrato y su evidencia quedan registrados con timestamp y se envían por email.
                </p>
              </Card.Content>
            </Card>
          </>)}
        </>)}
      </main>
    </div>
  )
}

/* ── canvas de firma — pointer events, fondo blanco, trazo negro ─────── */

function PadFirma({ canvasRef, habilitado, onTrazo, onBorrar }: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  habilitado: boolean
  onTrazo: () => void
  onBorrar: () => void
}) {
  const dibujando = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)
  const tieneTrazo = useRef(false)

  /* tamaño físico = CSS × DPR; preserva el dibujo al re-dimensionar */
  const preparar = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    if (rect.width === 0) return
    const dpr = window.devicePixelRatio || 1
    const prev = cv.width > 1 ? cv.toDataURL() : null
    cv.width = Math.round(rect.width * dpr)
    cv.height = Math.round(rect.height * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 2.4
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    if (prev) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = prev
    }
  }, [canvasRef])

  useEffect(() => {
    preparar()
    const t = setTimeout(preparar, 120) // tras fuentes/layout
    const cv = canvasRef.current
    const ro = new ResizeObserver(preparar)
    if (cv) ro.observe(cv)
    return () => { clearTimeout(t); ro.disconnect() }
  }, [preparar, canvasRef])

  function ctx() { return canvasRef.current?.getContext('2d') ?? null }

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function marcarTrazo() {
    if (!tieneTrazo.current) { tieneTrazo.current = true; onTrazo() }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!habilitado) return
    e.preventDefault()
    dibujando.current = true
    ultimo.current = pos(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    // punto suelto: un tap también cuenta como firma
    const c = ctx()
    const p = ultimo.current
    if (c && p) {
      c.fillStyle = '#111111'
      c.beginPath(); c.arc(p.x, p.y, 1.2, 0, Math.PI * 2); c.fill()
      marcarTrazo()
    }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!habilitado || !dibujando.current || !ultimo.current) return
    const c = ctx()
    if (!c) return
    const p = pos(e)
    c.beginPath(); c.moveTo(ultimo.current.x, ultimo.current.y); c.lineTo(p.x, p.y); c.stroke()
    ultimo.current = p
    marcarTrazo()
  }

  function up() { dibujando.current = false; ultimo.current = null }

  function borrar() {
    const cv = canvasRef.current
    const c = ctx()
    if (!cv || !c) return
    const rect = cv.getBoundingClientRect()
    c.save()
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, cv.width, cv.height)
    c.restore()
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, rect.width, rect.height)
    tieneTrazo.current = false
    onBorrar()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`relative rounded-2xl border overflow-hidden ${habilitado ? 'border-accent/50' : 'border-border'}`}>
        <canvas
          ref={canvasRef}
          className={`w-full h-44 bg-white touch-none ${habilitado ? 'cursor-crosshair' : 'opacity-50 cursor-not-allowed'}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        {!habilitado && (
          <div className="absolute inset-0 grid place-items-center bg-paper/60">
            <span className="text-xs font-bold text-muted bg-surface border border-border rounded-full px-3 py-1">
              Validá el código para firmar
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="tertiary" onPress={borrar} isDisabled={!habilitado}>
          Borrar
        </Button>
      </div>
    </div>
  )
}
