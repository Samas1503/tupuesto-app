import { useEffect, useState } from 'react'
import { Alert, AlertDialog, Button, Card, Chip, Disclosure, Input, Label, ListBox, NumberField, Select, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { db } from '../db'
import { useDatos, useJornadaVendedor, useJornadasLibres, useVentasDe } from '../lib/data'
import { cargado, despachoValor, repuestas, stockActual, vendidosRegistrados, ventasTotal } from '../lib/arqueo'
import { fmtFecha, fmtHora, fmtMoney, hoyISO } from '../lib/format'
import type { Cierre, MetodoPago, Producto } from '../types'


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
  const [selLogin, setSelLogin] = useState<number | null>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [debeElegirPin, setDebeElegirPin] = useState<number | null>(null)
  const [pinNuevo, setPinNuevo] = useState('')
  const [solTarget, setSolTarget] = useState<number | null>(null)
  const [solMotivo, setSolMotivo] = useState('')
  const [solEnviada, setSolEnviada] = useState(false)
  const [fondoTurno, setFondoTurno] = useState(0)
  const libres = useJornadasLibres(hoy)
  const [listo, setListo] = useState(false)

  // método de cobro por defecto de la venta en curso (persiste entre ventas)
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')


  // cuando aparece la jornada, inicializar el destino QR con el default del puesto
  useEffect(() => {
    setListo(false)
  }, [jornada?.id])

  function entrar() {
    const v = vendedores.find(x => x.id === selLogin)
    if (!v) return
    if (v.pin && v.pin !== pin.trim()) { setPinError(true); return }
    if (v.debeCambiarPin) { setDebeElegirPin(v.id!); return }
    setVendedorId(v.id!)
    localStorage.setItem('tp-vendedor', String(v.id))
  }

  async function tomarTurno(jornadaId: number) {
    await db.jornadas.update(jornadaId, { vendedorId: vendedorId ?? undefined, fondoCaja: fondoTurno })
    setFondoTurno(0)
  }

  async function solicitarBaja() {
    if (vendedorId == null || solTarget == null) return
    await db.solicitudes.add({
      tipo: 'eliminar-usuario',
      vendedorId: solTarget,
      solicitadoPor: vendedorId,
      motivo: solMotivo.trim() || undefined,
      estado: 'pendiente',
      createdAt: Date.now(),
    })
    setSolTarget(null); setSolMotivo(''); setSolEnviada(true)
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
    setPin(''); setSelLogin(null); setPinError(false)
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
      efectivoContado: ventas.filter(v => v.metodoPago === 'efectivo').reduce((a, v) => a + v.total, 0),
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
            <Card.Description>Entrá con tu nombre y tu PIN.</Card.Description>
          </Card.Header>
          <Card.Content className="px-4 py-3 flex flex-col gap-3">
            <Select
              placeholder="Elegí tu nombre"
              selectedKey={selLogin != null ? String(selLogin) : null}
              onSelectionChange={k => { setSelLogin(k != null ? Number(k) : null); setPinError(false) }}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {vendedores.filter(v => v.activo).map(v => (
                    <ListBox.Item key={v.id} id={String(v.id)} textValue={v.nombre}>
                      {v.nombre}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <TextField value={pin} onChange={v => { setPin(v); setPinError(false) }}>
              <Label>PIN</Label>
              <Input type="password" inputMode="numeric" maxLength={4} placeholder="••••" />
            </TextField>
            {pinError && <p className="text-xs text-danger font-semibold">PIN incorrecto.</p>}
            <Button variant="primary" onPress={entrar} isDisabled={selLogin == null || (vendedores.find(x => x.id === selLogin)?.pin != null && pin.trim() === '')}>
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
              <Alert.Title>Hoy no tenés jornada</Alert.Title>
              <Alert.Description>El dueño todavía no cargó ningún despacho del día.</Alert.Description>
            </Alert.Content>
          </Alert>
        )
      )}

      {jornada && puesto && (
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
                <Button size="lg" variant="primary" onPress={cerrarDia}>
                  Cerrar el día
                </Button>
              </Card.Content>
            </Card>
          )}

          {(jornada.estado === 'cerrada' || listo) && jornada.estado !== 'confirmada' && (
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

          {/* pedir baja de un usuario al admin */}
          <Disclosure>
            <Disclosure.Trigger className="w-full text-left">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Solicitar baja de usuario →</span>
            </Disclosure.Trigger>
            <Disclosure.Content>
              <Card>
                <Card.Content className="px-4 py-3 flex flex-col gap-3">
                  {solEnviada ? (
                    <p className="text-sm text-success">Solicitud enviada. El dueño la revisa.</p>
                  ) : (
                    <>
                      <Select
                        placeholder="¿A quién?"
                        selectedKey={solTarget != null ? String(solTarget) : null}
                        onSelectionChange={k => setSolTarget(k != null ? Number(k) : null)}
                      >
                        <Label>Usuario</Label>
                        <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {vendedores.filter(v => v.id !== vendedorId).map(v => (
                              <ListBox.Item key={v.id} id={String(v.id)} textValue={v.nombre}>
                                {v.nombre}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      <TextField value={solMotivo} onChange={setSolMotivo}>
                        <Label>Motivo (opcional)</Label>
                        <Input placeholder="Ej: ya no trabaja acá" />
                      </TextField>
                      <Button variant="outline" onPress={solicitarBaja} isDisabled={solTarget == null}>
                        Enviar solicitud
                      </Button>
                    </>
                  )}
                </Card.Content>
              </Card>
            </Disclosure.Content>
          </Disclosure>

          {jornada.estado === 'confirmada' && (
            <Alert status="success">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Rendición confirmada</Alert.Title>
                <Alert.Description>El dueño ya vio tu rendición de hoy.</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </>
      )}
    </div>
  )
}

/* ── producto vendible: tarjeta que abre modal de venta ─────── */
function ProductoVenta({
  p,
  despachado,
  repuesto,
  stock,
  habilitado,
  metodoInicial,
  onVenta,
}: {
  p: Producto
  despachado: number
  repuesto: number
  stock: number
  habilitado: boolean
  metodoInicial: MetodoPago
  onVenta: (p: Producto, cantidad: number, metodo: MetodoPago) => void
}) {
  const [cant, setCant] = useState(1)
  const [metodo, setMetodo] = useState<MetodoPago>(metodoInicial)
  const agotado = stock <= 0

  return (
    <AlertDialog>
      <Button
        isDisabled={!habilitado || agotado}
        variant="ghost"
        className={`!h-auto !min-w-0 !w-full !p-2.5 !justify-start !flex-col !items-stretch !gap-1.5 !text-left !whitespace-normal !rounded-xl !border !border-border !bg-surface transition-all
          ${agotado ? '!opacity-40' : habilitado ? 'hover:!border-accent hover:!shadow-md active:!scale-[0.97]' : ''}`}
      >
        {p.imagen ? (
          <img src={p.imagen} alt={p.nombre} className="h-16 w-full rounded-lg object-cover" />
        ) : (
          <div className="h-16 w-full rounded-lg bg-accent text-accent-foreground flex items-center justify-center text-xl font-extrabold">
            {p.nombre.charAt(0)}
          </div>
        )}
        <span className="text-sm font-semibold truncate">{p.nombre}</span>
        {p.ingredientes && (
          <span className="text-[0.65rem] text-muted/70 leading-tight line-clamp-2">{p.ingredientes}</span>
        )}
        <span className="text-xs num text-muted">
          llevaste {despachado}{repuesto > 0 ? ` +${repuesto}` : ''} · quedan {stock}
        </span>
        <span className="text-sm font-bold num">{fmtMoney(p.precio)}</span>
      </Button>

      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[360px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Heading>{p.nombre}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className="flex flex-col gap-4">
                <div className="flex justify-between text-sm num">
                  <span className="text-muted">Precio</span><b>{fmtMoney(p.precio)}</b>
                </div>
                <NumberField value={cant} onChange={v => setCant(Math.max(1, v ?? 1))} minValue={1} maxValue={Math.max(1, stock)}>
                  <Label>Cantidad (quedan {stock})</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                </NumberField>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">¿Cómo te pagaron?</p>
                  <ToggleButtonGroup
                    selectionMode="single"
                    selectedKeys={new Set([metodo])}
                    onSelectionChange={k => setMetodo(([...k][0] as MetodoPago) ?? 'efectivo')}
                    size="sm"
                  >
                    <ToggleButton id="efectivo">Efectivo</ToggleButton>
                    <ToggleButton id="qr">QR</ToggleButton>
                    <ToggleButton id="transferencia">Transf.</ToggleButton>
                  </ToggleButtonGroup>
                </div>
                <div className="flex justify-between text-base font-bold num">
                  <span>Total</span><span>{fmtMoney(cant * p.precio)}</span>
                </div>
              </div>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">Volver</Button>
              <Button slot="close" variant="primary" onPress={() => onVenta(p, cant, metodo)}>
                Anotar venta
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}
