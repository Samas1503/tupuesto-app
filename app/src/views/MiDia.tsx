import { useEffect, useState } from 'react'
import { Alert, AlertDialog, Button, Card, Chip, Input, Label, NumberField, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { db } from '../db'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDatos, useJornadaVendedor, useJornadasLibres, useVentasDe } from '../lib/data'
import { cargado, despachoValor, horasTurno, repuestas, stockActual, totalVentas, vendidos, vendidosRegistrados, ventasTotal } from '../lib/arqueo'
import { fmtFecha, fmtHora, fmtMoney, hoyISO } from '../lib/format'
import type { Cierre, Jornada, MetodoPago, Producto, Venta } from '../types'


/** badge del método de cobro de una venta */
function chipMetodo(m: MetodoPago) {
  if (m === 'efectivo') return <Chip color="success" variant="soft" size="sm">Efectivo</Chip>
  if (m === 'qr') return <Chip color="accent" variant="soft" size="sm">QR</Chip>
  return <Chip color="default" variant="soft" size="sm">Transferencia</Chip>
}

export default function MiDia() {
  const { productos, puestos, vendedores } = useDatos()
  const [vendedorId, setVendedorId] = useState<number | null>(() => {
    const v = localStorage.getItem('tp-vendedor')
    return v ? Number(v) : null
  })
  const hoy = hoyISO()
  const jornada = useJornadaVendedor(vendedorId, hoy)
  const ventas = useVentasDe(jornada?.id)
  const puesto = jornada ? puestos.find(p => p.id === jornada.puestoId) : undefined

  // estado del formulario de cierre
  const [nota, setNota] = useState('')
  const [emailLogin, setEmailLogin] = useState('')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [debeElegirPin, setDebeElegirPin] = useState<number | null>(null)
  const [pinNuevo, setPinNuevo] = useState('')
  const [fondoTurno, setFondoTurno] = useState(0)
  const [solCierre, setSolCierre] = useState(false)
  const [motivoCierre, setMotivoCierre] = useState('')
  const [solCierreEnviada, setSolCierreEnviada] = useState(false)
  const libres = useJornadasLibres(hoy)
  const [listo, setListo] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)

  // historial propio: jornadas y ventas registradas — visible sin turno / toggle con turno
  const misJornadas = useLiveQuery(
    () => vendedorId == null ? [] : db.jornadas.where('vendedorId').equals(vendedorId).reverse().sortBy('fecha'),
    [vendedorId],
  ) ?? []
  const misVentas = useLiveQuery(
    () => db.ventas.filter(v => misJornadas.some(j => j.id === v.jornadaId)).toArray(),
    [misJornadas.length],
  ) ?? []
  const stats = {
    turnos: misJornadas.filter(j => j.cierre).length,
    horas: misJornadas.reduce((a, j) => a + horasTurno(j), 0),
    unidades: misJornadas.reduce((a, j) => a + productos.reduce((x, p) => x + (j.cierre ? vendidos(j, p.id!) : vendidosRegistrados(misVentas.filter(v => v.jornadaId === j.id), p.id!)), 0), 0),
    vendido: misJornadas.reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(misVentas.filter(v => v.jornadaId === j.id))), 0),
  }

  // método de cobro por defecto de la venta en curso (persiste entre ventas)
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')


  // cuando aparece la jornada, inicializar el destino QR con el default del puesto
  useEffect(() => {
    setListo(false)
  }, [jornada?.id])

  function entrar() {
    const v = vendedores.find(x => x.activo && x.email?.toLowerCase() === emailLogin.trim().toLowerCase())
    if (!v || (v.pin && v.pin !== pin.trim())) { setPinError(true); return }
    if (v.debeCambiarPin) { setDebeElegirPin(v.id!); return }
    setVendedorId(v.id!)
    localStorage.setItem('tp-vendedor', String(v.id))
  }

  // ventana de cierre normal: [horaFin − 5 min, en adelante] o si el dueño aprobó uno anticipado
  const puedeCerrar = (() => {
    if (!jornada?.horaFin || jornada.cierreAnticipadoOk) return true
    const [h, m] = jornada.horaFin.split(':').map(Number)
    const fin = new Date(); fin.setHours(h, m - 5, 0, 0)
    return Date.now() >= fin.getTime()
  })()

  async function solicitarCierre() {
    if (vendedorId == null || jornada?.id == null || !motivoCierre.trim()) return
    await db.solicitudes.add({
      tipo: 'cierre-anticipado',
      jornadaId: jornada.id,
      vendedorId,
      solicitadoPor: vendedorId,
      motivo: motivoCierre.trim(),
      estado: 'pendiente',
      createdAt: Date.now(),
    })
    setSolCierreEnviada(true)
    setMotivoCierre('')
    setSolCierre(false)
  }

  async function tomarTurno(jornadaId: number) {
    await db.jornadas.update(jornadaId, { vendedorId: vendedorId ?? undefined, fondoCaja: fondoTurno })
    setFondoTurno(0)
  }



  async function elegirPin() {
    const p = pinNuevo.trim()
    if (debeElegirPin == null || p.length < 4) return
    await db.vendedores.update(debeElegirPin, { pin: p, debeCambiarPin: false })
    setDebeElegirPin(null)
    setVendedorId(debeElegirPin)
    localStorage.setItem('tp-vendedor', String(debeElegirPin))
  }

  function salir() {
    setVendedorId(null)
    setPin(''); setEmailLogin(''); setPinError(false)
    localStorage.removeItem('tp-vendedor')
  }

  // anota una venta de UN producto (desde el modal) — el cierre sigue siendo por conteo
  async function registrarItem(p: Producto, cantidad: number, metodo: MetodoPago) {
    if (!jornada || cantidad <= 0) return
    await db.ventas.add({
      jornadaId: jornada.id!,
      items: [{ productoId: p.id!, cantidad }],
      total: cantidad * p.precio,
      metodoPago: metodo,
      createdAt: Date.now(),
    })
    setMetodoPago(metodo)
  }

  async function cerrarDia() {
    if (!jornada) return
    const remanente = jornada.despacho
      .map(l => ({ productoId: l.productoId, cantidad: Math.max(0, cargado(jornada, l.productoId) - vendidosRegistrados(ventas, l.productoId)) }))
      .filter(l => l.cantidad > 0)
    const cierre: Cierre = {
      remanente,
      merma: [],
      // efectivo físico del cajón = fondo recibido + ventas en efectivo
      efectivoContado: (jornada.fondoCaja ?? 0) + ventas.filter(v => v.metodoPago === 'efectivo').reduce((a, v) => a + v.total, 0),
      qrTotal: ventas.filter(v => v.metodoPago !== 'efectivo').reduce((a, v) => a + v.total, 0),
      qrDestino: puesto?.qrDestinoDefault ?? 'negocio',
      nota: nota.trim() || undefined,
      cerradaAt: Date.now(),
    }
    await db.jornadas.update(jornada.id!, { cierre, estado: 'cerrada' })
    setListo(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Mi día</h1>
        <p className="text-sm text-muted capitalize">{fmtFecha(hoy)}</p>
      </div>

      {debeElegirPin != null && (
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
      )}

      {vendedorId == null && debeElegirPin == null ? (
        <Card>
          <Card.Header className="px-4 pt-4 pb-0">
            <Card.Title className="text-base">¿Quién sos?</Card.Title>
            <Card.Description>Entrá con tu email y el PIN que te mandamos.</Card.Description>
          </Card.Header>
          <Card.Content className="px-4 py-3 flex flex-col gap-3">
            <TextField value={emailLogin} onChange={v => { setEmailLogin(v); setPinError(false) }}>
              <Label>Email</Label>
              <Input type="email" placeholder="tu@correo.com" autoComplete="email" />
            </TextField>
            <TextField value={pin} onChange={v => { setPin(v); setPinError(false) }}>
              <Label>PIN</Label>
              <Input type="password" inputMode="numeric" maxLength={4} placeholder="••••" />
            </TextField>
            {pinError && <p className="text-xs text-danger font-semibold">Email o PIN incorrecto.</p>}
            <Button variant="primary" onPress={entrar} isDisabled={emailLogin.trim() === '' || pin.trim() === ''}>
              Entrar
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Vendés como <b className="text-foreground">{vendedores.find(v => v.id === vendedorId)?.nombre}</b></span>
          <Button size="sm" variant="tertiary" onPress={salir}>Salir</Button>
        </div>
      )}

      {vendedorId != null && (!jornada || jornada.estado === 'confirmada') && (
        libres.length > 0 ? (
          <Card>
            <Card.Header className="px-4 pt-4 pb-0">
              <Card.Title className="text-base">Turnos sin asignar</Card.Title>
              <Card.Description>Tomá el tuyo — se vincula a tu cuenta y fijás el fondo que recibiste.</Card.Description>
            </Card.Header>
            <Card.Content className="px-4 py-3 flex flex-col gap-3">
              {libres.map(jl => {
                const pl = puestos.find(x => x.id === jl.puestoId)
                return (
                  <div key={jl.id} className="border border-border rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-baseline">
                      <b className="text-sm">{pl?.nombre}</b>
                      <span className="text-xs text-muted">{pl?.ubicacion}</span>
                    </div>
                    <p className="text-xs text-muted num">
                      {jl.despacho.length} productos · valor {fmtMoney(despachoValor(jl, productos))}
                    </p>
                    <div className="flex gap-2 items-end">
                      <NumberField className="flex-1" value={fondoTurno} onChange={v => setFondoTurno(v ?? 0)} minValue={0} step={1000} formatOptions={{ style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }}>
                        <Label>Fondo recibido</Label>
                        <NumberField.Group>
                          <NumberField.Input />
                        </NumberField.Group>
                      </NumberField>
                      <Button variant="primary" onPress={() => tomarTurno(jl.id!)} isDisabled={fondoTurno <= 0}>
                        Empezar turno
                      </Button>
                    </div>
                  </div>
                )
              })}
            </Card.Content>
          </Card>
        ) : (
          <Alert>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{jornada?.estado === 'confirmada' ? 'Turno terminado' : 'Hoy no tenés jornada'}</Alert.Title>
              <Alert.Description>
                {jornada?.estado === 'confirmada'
                  ? 'El dueño confirmó tu rendición. Podés tomar otro turno o volver mañana.'
                  : 'El dueño todavía no cargó ningún despacho del día.'}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )
      )}

      {vendedorId != null && (!jornada || jornada.estado === 'confirmada') && (
        <MiHistorial misJornadas={misJornadas} misVentas={misVentas} stats={stats} productos={productos} puestos={puestos} />
      )}

      {jornada && puesto && jornada.estado !== 'confirmada' && (
        <>
          {/* ── VENDER: tus productos del día — tocá uno para anotar ── */}
          <Card>
            <Card.Header className="px-4 pt-4 pb-0">
              <Card.Title className="text-base">Vender</Card.Title>
              <Card.Description>
                {puesto.nombre} · fondo <b className="num">{fmtMoney(jornada.fondoCaja ?? 0)}</b> · tocá un producto para anotar la venta
              </Card.Description>
            </Card.Header>
            <Card.Content className="px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                {jornada.despacho.map(l => {
                  const p = productos.find(x => x.id === l.productoId)
                  if (!p) return null
                  const stock = stockActual(jornada, ventas, p.id!)
                  return (
                    <ProductoVenta
                      key={p.id}
                      p={p}
                      despachado={l.cantidad}
                      repuesto={repuestas(jornada, p.id!)}
                      stock={stock}
                      habilitado={jornada.estado === 'abierta' && !listo}
                      metodoInicial={metodoPago}
                      onVenta={registrarItem}
                    />
                  )
                })}
              </div>
            </Card.Content>
          </Card>

          {/* ── MI TURNO: stock según lo anotado + ventas del día ── */}
          <Card>
            <Card.Header className="px-4 pt-4 pb-0">
              <Card.Title className="text-base">Mi turno</Card.Title>
              <Card.Description>Lo que anotaste vendiendo hoy.</Card.Description>
            </Card.Header>
            <Card.Content className="px-4 py-3 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                {jornada.despacho.map(l => {
                  const p = productos.find(x => x.id === l.productoId)
                  return p ? (
                    <div key={l.productoId} className="flex justify-between text-sm num">
                      <span>{p.nombre}</span>
                      <span className="text-muted">
                        recibí {l.cantidad}{repuestas(jornada, l.productoId) > 0 ? ` · +${repuestas(jornada, l.productoId)} repuestas` : ''} · quedé con {stockActual(jornada, ventas, l.productoId)}
                      </span>
                    </div>
                  ) : null
                })}
              </div>

              <div className="border-t border-dashed border-border pt-3 flex flex-col gap-2">
                {ventas.length === 0 ? (
                  <p className="text-sm text-muted">Todavía no anotaste ventas.</p>
                ) : (
                  [...ventas].reverse().map(v => (
                    <div key={v.id} className="flex items-center gap-2 text-sm">
                      <span className="num text-muted w-10 shrink-0">{fmtHora(v.createdAt)}</span>
                      <span className="flex-1 min-w-0 truncate">
                        {v.items
                          .map(l => `${l.cantidad} ${productos.find(p => p.id === l.productoId)?.nombre ?? '?'}`)
                          .join(', ')}
                      </span>
                      {chipMetodo(v.metodoPago)}
                      <b className="num shrink-0">{fmtMoney(v.total)}</b>
                    </div>
                  ))
                )}
              </div>

              {ventas.length > 0 && (
                <div className="flex justify-between text-sm num font-bold">
                  <span>Anotado hoy</span>
                  <span>{fmtMoney(ventasTotal(ventas))}</span>
                </div>
              )}
            </Card.Content>
          </Card>

          {/* historial propio — oculto tras botón durante el turno */}
          <button
            onClick={() => setVerHistorial(v => !v)}
            className="text-xs text-muted/70 underline underline-offset-2 self-center"
          >
            {verHistorial ? 'Ocultar mi historial' : 'Ver mi historial'}
          </button>
          {verHistorial && (
            <MiHistorial misJornadas={misJornadas} misVentas={misVentas} stats={stats} productos={productos} puestos={puestos} />
          )}

          {jornada.estado === 'abierta' && !listo && (
            /* ── CIERRE automático: sobrantes = despacho − registrado,
               recaudado = Σ ventas por método ── */
            <Card>
              <Card.Header className="px-4 pt-4 pb-0">
                <Card.Title className="text-base">Cerrar el día</Card.Title>
                <Card.Description>Se calcula solo con lo que anotaste. Solo dejá una nota si hace falta.</Card.Description>
              </Card.Header>
              <Card.Content className="px-4 py-3 flex flex-col gap-4">
                <TextField value={nota} onChange={setNota}>
                  <Label>Nota (opcional)</Label>
                  <Input placeholder="Ej: llovió, vendí menos" />
                </TextField>
                {puedeCerrar ? (
                  <Button size="lg" variant="primary" onPress={cerrarDia}>
                    Cerrar el día
                  </Button>
                ) : solCierreEnviada ? (
                  <p className="text-xs text-muted text-center">
                    Pediste el cierre — cuando el dueño lo apruebe, acá aparece el botón.
                  </p>
                ) : (
                  /* fuera de la ventana: pedir aprobación — discreto a propósito */
                  <button
                    onClick={() => setSolCierre(true)}
                    className="text-xs text-muted/70 underline underline-offset-2 self-center"
                  >
                    ¿Terminaste antes? Pedí el cierre
                  </button>
                )}
              </Card.Content>
            </Card>
          )}

          {(jornada.estado === 'cerrada' || listo) && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Enviado</Alert.Title>
                <Alert.Description>
                  Cerraste a las {jornada.cierre ? fmtHora(jornada.cierre.cerradaAt) : '—'}. El dueño confirma la rendición.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}




        </>
      )}
      {/* solicitud de cierre anticipado — va al dueño con motivo */}
      <AlertDialog isOpen={solCierre} onOpenChange={o => { if (!o) setSolCierre(false) }}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[360px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Heading>Pedir cierre anticipado</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted">
                    El turno cierra a las <b className="num">{jornada?.horaFin}</b>. Para cerrar antes,
                    tu motivo le llega al dueño — si lo aprueba, se habilita el botón.
                  </p>
                  <TextField value={motivoCierre} onChange={setMotivoCierre}>
                    <Label>Motivo</Label>
                    <Input placeholder="Ej: llovió y no hay gente" />
                  </TextField>
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">Cancelar</Button>
                <Button slot="close" variant="primary" onPress={solicitarCierre} isDisabled={!motivoCierre.trim()}>
                  Enviar solicitud
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}

/** tarjeta de producto + modal de venta: cantidad + método → onVenta */
function ProductoVenta({
  p, despachado, repuesto, stock, habilitado, metodoInicial, onVenta,
}: {
  p: Producto
  despachado: number
  repuesto: number
  stock: number
  habilitado: boolean
  metodoInicial: MetodoPago
  onVenta: (p: Producto, cantidad: number, metodo: MetodoPago) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [cant, setCant] = useState(1)
  const [metodo, setMetodo] = useState<MetodoPago>(metodoInicial)
  const agotado = stock <= 0

  return (
    <AlertDialog isOpen={abierto} onOpenChange={setAbierto}>
      <Button
        variant="ghost"
        isDisabled={!habilitado || agotado}
        className={`!block !h-auto !p-2.5 !text-left !rounded-xl border border-border !bg-surface ${agotado ? 'opacity-40' : ''}`}
      >
        {p.imagen ? (
          <img src={p.imagen} alt="" className="w-full h-16 rounded-lg object-cover mb-1.5" />
        ) : (
          <div className="w-full h-16 rounded-lg bg-accent/15 flex items-center justify-center text-2xl font-extrabold text-accent mb-1.5">
            {p.nombre.charAt(0)}
          </div>
        )}
        <p className="text-sm font-bold leading-tight truncate">{p.nombre}</p>
        {p.ingredientes && (
          <p className="text-[0.6rem] text-muted/70 truncate">{p.ingredientes}</p>
        )}
        <p className="text-[0.65rem] num text-muted mt-0.5">
          llevaste {despachado}{repuesto > 0 ? ` +${repuesto}` : ''} · quedan {stock}
        </p>
        <p className="text-xs num font-bold text-accent">{fmtMoney(p.precio)}</p>
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[360px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Heading>{p.nombre}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className="flex flex-col gap-3">
                <NumberField value={cant} onChange={v => setCant(Math.min(stock, Math.max(1, v ?? 1)))} minValue={1} maxValue={Math.max(1, stock)} aria-label="Cantidad">
                  <Label>Cantidad</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                </NumberField>
                <ToggleButtonGroup
                  selectionMode="single"
                  selectedKeys={new Set([metodo])}
                  onSelectionChange={k => { const m = [...k][0] as MetodoPago | undefined; if (m) setMetodo(m) }}
                  aria-label="Método de cobro"
                >
                  <ToggleButton id="efectivo">Efectivo</ToggleButton>
                  <ToggleButton id="qr">QR</ToggleButton>
                  <ToggleButton id="transferencia">Transf.</ToggleButton>
                </ToggleButtonGroup>
                <div className="flex justify-between text-sm num">
                  <span className="text-muted">Total</span>
                  <b>{fmtMoney(cant * p.precio)}</b>
                </div>
              </div>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">Cancelar</Button>
              <Button
                slot="close"
                variant="primary"
                onPress={() => { onVenta(p, cant, metodo); setCant(1) }}
                isDisabled={cant <= 0 || cant > stock}
              >
                Anotar venta
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}

/** historial del vendedor: stats + jornadas agrupadas por fecha, productos por turno */
function MiHistorial({
  misJornadas, misVentas, stats, productos, puestos,
}: {
  misJornadas: Jornada[]
  misVentas: Venta[]
  stats: { turnos: number; horas: number; unidades: number; vendido: number }
  productos: Producto[]
  puestos: { id?: number; nombre: string }[]
}) {
  // agrupar por fecha desc
  const porFecha = new Map<string, Jornada[]>()
  for (const j of misJornadas) {
    if (!porFecha.has(j.fecha)) porFecha.set(j.fecha, [])
    porFecha.get(j.fecha)!.push(j)
  }
  const fechas = [...porFecha.keys()].sort().reverse().slice(0, 10)

  const vendidoDe = (j: Jornada, pid: number) =>
    j.cierre ? vendidos(j, pid) : vendidosRegistrados(misVentas.filter(v => v.jornadaId === j.id), pid)

  return (
    <Card>
      <Card.Header className="px-4 pt-4 pb-0">
        <Card.Title className="text-base">Mi historial</Card.Title>
        <Card.Description>Tus números hasta la fecha — productos por turno.</Card.Description>
      </Card.Header>
      <Card.Content className="px-4 py-3 flex flex-col gap-3">
        {/* resumen acumulado */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><p className="text-base font-extrabold num">{stats.turnos}</p><p className="text-[0.6rem] text-muted uppercase font-bold">turnos</p></div>
          <div><p className="text-base font-extrabold num">{stats.horas.toFixed(0)}h</p><p className="text-[0.6rem] text-muted uppercase font-bold">horas</p></div>
          <div><p className="text-base font-extrabold num">{stats.unidades}</p><p className="text-[0.6rem] text-muted uppercase font-bold">unidades</p></div>
          <div><p className="text-base font-extrabold num">{fmtMoney(stats.vendido)}</p><p className="text-[0.6rem] text-muted uppercase font-bold">vendido</p></div>
        </div>

        {/* por fecha → turnos → productos */}
        {fechas.length === 0 && <p className="text-xs text-muted">Todavía no tenés jornadas registradas.</p>}
        {fechas.map(fecha => {
          const js = porFecha.get(fecha)!
          const totalDia = js.reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(misVentas.filter(v => v.jornadaId === j.id))), 0)
          return (
            <div key={fecha} className="border-t border-dashed border-border pt-2.5">
              <div className="flex justify-between items-baseline mb-1.5">
                <b className="text-xs uppercase tracking-wide capitalize">{fmtFecha(fecha)}</b>
                <b className="text-sm num">{fmtMoney(totalDia)}</b>
              </div>
              {js.map((j, turno) => {
                const p = puestos.find(x => x.id === j.puestoId)
                const prods = productos
                  .map(pp => ({ pp, u: vendidoDe(j, pp.id!) }))
                  .filter(x => x.u > 0)
                const total = j.cierre ? totalVentas(j, productos) : ventasTotal(misVentas.filter(v => v.jornadaId === j.id))
                return (
                  <div key={j.id} className="mb-2 rounded-lg bg-muted/5 border border-border/50 p-2.5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold">
                        {p?.nombre ?? '—'}{js.length > 1 ? ` · turno ${turno + 1}` : ''}
                      </span>
                      <Chip size="sm" variant="soft" color={j.estado === 'confirmada' ? 'success' : j.estado === 'cerrada' ? 'warning' : 'default'}>
                        {j.estado === 'confirmada' ? 'confirmada' : j.estado === 'cerrada' ? 'cerrada' : 'en curso'}
                      </Chip>
                    </div>
                    {prods.length > 0 ? (
                      <ul className="flex flex-col gap-0.5">
                        {prods.map(({ pp, u }) => (
                          <li key={pp.id} className="flex justify-between text-xs num">
                            <span className="text-muted">{pp.nombre}</span>
                            <span>{u}u · {fmtMoney(u * pp.precio)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[0.65rem] text-muted/60">sin ventas todavía</p>
                    )}
                    <div className="flex justify-end mt-1">
                      <b className="text-xs num text-accent">{fmtMoney(total)}</b>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </Card.Content>
    </Card>
  )
}
