import { AlertDialog, Button, Card, Chip, Disclosure, Input, Label, ListBox, Meter, NumberField, Select, Tabs, TextField } from '@heroui/react'
import { db } from '../db'
import { useDatos, useJornadasDe, useJornadasRango, useVentasDeJornadas } from '../lib/data'
import { fmtDif, fmtFecha, fmtHora, fmtMoney, hoyISO, isoMenosDias } from '../lib/format'
import { cargado, cobrado, despachoValor, diferencia, esperado, gananciaReal, mermaUnidades, qrEnCero, qrFueraDeCuenta, stockActual, UMBRAL_REPOSICION, vendidos, totalVentas, ventasTotal } from '../lib/arqueo'
import { useState } from 'react'
import EmptyState from '../components/EmptyState'
import { pushRow } from '../lib/snake'
import type { Jornada, Linea, MetodoPago, Producto, Venta } from '../types'

function estadoChip(j: Jornada) {
  if (j.estado === 'abierta') return <Chip color="default" variant="soft">Vendiendo</Chip>
  if (j.estado === 'cerrada') return <Chip color="warning" variant="soft">Cerró — falta tu OK</Chip>
  return <Chip color="success" variant="soft">Confirmada</Chip>
}

const METODO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  qr: 'QR',
  transferencia: 'Transf.',
}

/** detalle colapsable de las ventas que el vendedor registró en el turno */
function VentasDelTurno({ ventas, productos }: { ventas: Venta[]; productos: Producto[] }) {
  const resumen = (v: Venta) =>
    v.items
      .map(l => `${l.cantidad} ${productos.find(p => p.id === l.productoId)?.nombre ?? '?'}`)
      .join(', ')
  return (
    <Disclosure>
      <Disclosure.Heading>
        <Button slot="trigger" variant="ghost" size="sm">
          Ventas del turno{ventas.length > 0 ? ` · ${ventas.length}` : ''}
          <Disclosure.Indicator />
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="px-1 pt-1 pb-0">
          {ventas.length === 0 ? (
            <p className="text-xs text-muted">Sin ventas registradas.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {ventas.map(v => (
                <li key={v.id} className="flex items-center gap-2 text-xs">
                  <span className="num text-muted w-10 shrink-0">{fmtHora(v.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">{resumen(v)}</span>
                  <Chip color="default" variant="soft" size="sm">
                    {METODO_LABEL[v.metodoPago]}
                  </Chip>
                  <b className="num">{fmtMoney(v.total)}</b>
                </li>
              ))}
            </ul>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  )
}

export default function Hoy() {
  const { productos, puestos, vendedores } = useDatos()
  const hoy = hoyISO()
  const jornadas = useJornadasDe(hoy)
  const ayer = isoMenosDias(1)
  const jornadasAyer = useJornadasDe(ayer)
  const [tab, setTab] = useState('turnos')

  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))

  // productos del día: sobrante de ayer + despachado hoy (+repos) − vendido registrado
  const disponibleHoy = productos.filter(p => p.activo).map(p => {
    const sobranteAyer = jornadasAyer.reduce((a, j) =>
      a + (j.cierre?.remanente.find(l => l.productoId === p.id)?.cantidad ?? 0), 0)
    const despachado = jornadas.reduce((a, j) => a + cargado(j, p.id!), 0)
    const vendidoHoy = ventas.reduce((a, v) =>
      a + (v.items.find(l => l.productoId === p.id)?.cantidad ?? 0), 0)
    const porConteo = jornadas.reduce((a, j) => a + vendidos(j, p.id!), 0)
    const vendido = Math.max(vendidoHoy, porConteo)
    return { p, sobranteAyer, despachado, vendido, disponible: Math.max(0, sobranteAyer + despachado - vendido) }
  }).filter(x => x.sobranteAyer > 0 || x.despachado > 0)
  // histórico 28d para contrastar el flag "QR en cero" (D3)
  const rango28 = useJornadasRango(isoMenosDias(28), hoy)
  // ventas registradas en el turno, de todas las jornadas de hoy

  const nomV = (id: number | undefined) => vendedores.find(v => v.id === id)?.nombre ?? 'sin asignar'

  // planificación del turno: despachos sin vendedor → asignar libre + fondo
  // nuevo despacho desde Hoy (fecha = hoy)
  const [puestoDesp, setPuestoDesp] = useState<number | null>(null)
  const [vendTurno, setVendTurno] = useState<number | null>(null)
  const [fondoTurno, setFondoTurno] = useState(0)
  const [horaFinTurno, setHoraFinTurno] = useState('')
  // saldo inicial: cuánto sobrante de ayer entra a la venta (solo primer turno del día)
  const [carryOver, setCarryOver] = useState<Record<number, number>>({})
  const sobrantesAyer = productos.map(p => ({
    p,
    n: jornadasAyer.reduce((a, j) => a + (j.cierre?.remanente.find(l => l.productoId === p.id)?.cantidad ?? 0), 0),
  })).filter(x => x.n > 0)
  const esPrimerTurno = jornadas.length === 0
  const carryDe = (pid: number) => carryOver[pid] ?? (sobrantesAyer.find(x => x.p.id === pid)?.n ?? 0)
  const perdidaDescartes = sobrantesAyer.reduce((a, x) => a + (x.n - carryDe(x.p.id!)) * (x.p.precioCosto ?? 0), 0)
  const saldoIni = sobrantesAyer.map(x => ({ productoId: x.p.id!, cantidad: carryDe(x.p.id!) })).filter(l => l.cantidad > 0)
  const descarte = sobrantesAyer.map(x => ({ productoId: x.p.id!, cantidad: x.n - carryDe(x.p.id!) })).filter(l => l.cantidad > 0)
  const [lineasDesp, setLineasDesp] = useState<Linea[]>([])
  const [prodDesp, setProdDesp] = useState<number | null>(null)
  const [cantDesp, setCantDesp] = useState(1)
  const puestosLibres = puestos.filter(p => p.activo && !jornadas.some(j => j.puestoId === p.id && j.estado === 'abierta'))
  const elegiblesDesp = productos.filter(p => p.activo && !lineasDesp.some(l => l.productoId === p.id))

  async function crearDespachoPuesto() {
    const p = puestos.find(x => x.id === puestoDesp)
    if (!p || lineasDesp.length === 0) return
    const jid = await db.jornadas.add({
      puestoId: p.id!,
      fecha: hoy,
      despacho: lineasDesp,
      estado: 'abierta',
      createdAt: Date.now(),
    })
    void pushRow('jornadas', jid)
    setPuestoDesp(null); setLineasDesp([]); setProdDesp(null); setCantDesp(1)
  }

  async function crearTurno() {
    const p = puestos.find(x => x.id === puestoDesp)
    const v = vendedores.find(x => x.id === vendTurno)
    if (!p || !v || fondoTurno <= 0 || lineasDesp.length === 0) return
    const jid = await db.jornadas.add({
      puestoId: p.id!,
      vendedorId: v.id!,
      fondoCaja: fondoTurno,
      horaFin: horaFinTurno || undefined,
      saldoInicial: esPrimerTurno && saldoIni.length ? saldoIni : undefined,
      descarte: esPrimerTurno && descarte.length ? descarte : undefined,
      fecha: hoy,
      despacho: lineasDesp,
      estado: 'abierta',
      createdAt: Date.now(),
    })
    void pushRow('jornadas', jid)
    setPuestoDesp(null); setVendTurno(null); setFondoTurno(0); setHoraFinTurno('')
    setLineasDesp([]); setProdDesp(null); setCantDesp(1)
  }
  const ocupados = new Set(jornadas.filter(j => j.estado !== 'confirmada').map(j => j.vendedorId).filter(Boolean))
  const libres = vendedores.filter(v => v.activo && !ocupados.has(v.id!))
  // promedio QR/día del puesto en 28d (jornadas con cierre, excluye la jornada evaluada)
  const promQr28 = (puestoId: number, excluirId?: number) => {
    const js = rango28.filter(x => x.puestoId === puestoId && x.cierre && x.id !== excluirId)
    return js.length ? js.reduce((a, x) => a + x.cierre!.qrTotal, 0) / js.length : 0
  }

  // meta del día: Σ valor despachado vs. Σ vendido (registro en abierta, conteo en cerrada)
  const metaDia = jornadas.reduce((a, j) => a + despachoValor(j, productos), 0)
  const vendidoDia = jornadas.reduce((a, j) => {
    if (j.cierre) return a + totalVentas(j, productos)
    const vj = ventas.filter(v => v.jornadaId === j.id)
    return a + ventasTotal(vj)
  }, 0)
  const avanceDia = Math.min(100, metaDia > 0 ? (vendidoDia / metaDia) * 100 : 0)

  // totales del día (solo jornadas con cierre)
  const cerradas = jornadas.filter(j => j.cierre)
  const totEfe = cerradas.reduce((a, j) => a + j.cierre!.efectivoContado, 0)
  const totQrNeg = cerradas.filter(j => j.cierre!.qrDestino === 'negocio').reduce((a, j) => a + j.cierre!.qrTotal, 0)
  const totQrVend = cerradas.filter(j => j.cierre!.qrDestino === 'vendedor').reduce((a, j) => a + j.cierre!.qrTotal, 0)
  const totDif = cerradas.reduce((a, j) => a + diferencia(j, productos), 0)

  async function confirmar(j: Jornada) {
    await db.jornadas.update(j.id!, { estado: 'confirmada', confirmadaAt: Date.now() })
    void pushRow('jornadas', j.id!)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Hoy</h1>
        <span className="text-sm text-muted font-semibold capitalize">{fmtFecha(hoy)}</span>
      </div>

      {/* meta del día: lo vendido vs. lo despachado en todos los puestos */}
      {jornadas.length > 0 && (
        <Card>
          <Card.Content className="p-4">
            <div className="flex justify-between text-xs font-bold text-muted uppercase tracking-wide mb-2">
              <span>Cobrado hoy</span>
              <span className="num">{Math.round(avanceDia)}%</span>
            </div>
            <div className="h-3 rounded-lg overflow-hidden bg-[var(--viz-track)]">
              <div
                className="h-full bg-accent transition-all duration-500"
                style={{ width: `${avanceDia}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted">
              <span className="num">{fmtMoney(vendidoDia)} vendido</span>
              <span className="num">meta {fmtMoney(metaDia)}</span>
            </div>
            {cerradas.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 pt-2 border-t border-dashed border-border text-xs text-muted">
                <span className="num">Efectivo {fmtMoney(totEfe)}</span>
                <span className="num">QR a tu cuenta {fmtMoney(totQrNeg)}</span>
                {totQrVend > 0 && (
                  <span className="num text-danger font-semibold">QR a vendedor {fmtMoney(totQrVend)}</span>
                )}
                <span className={`num font-bold ${totDif < 0 ? 'text-danger' : 'text-success'}`}>{fmtDif(totDif)}</span>
              </div>
            )}
          </Card.Content>
        </Card>
      )}

      <Tabs selectedKey={tab} onSelectionChange={k => setTab(k as string)} className="flex flex-col gap-4">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Sección">
            <Tabs.Tab id="turnos">Turnos<Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="productos">Productos<Tabs.Indicator /></Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="turnos" className="flex flex-col gap-4">
      {jornadas.length === 0 && (
        <Card>
          <Card.Content className="p-2">
            <EmptyState
              titulo="Sin turnos hoy"
              descripcion="Todavía no creaste ningún turno — cada puesto necesita su vendedor, caja y despacho para arrancar."
              hint="Creá el primero con el botón +"
            />
          </Card.Content>
        </Card>
      )}

      {/* una tarjeta por jornada */}
      {jornadas.map(j => {
        const puesto = puestos.find(p => p.id === j.puestoId)
        const ventasJ = ventas.filter(v => v.jornadaId === j.id)
        // stock bajo según el registro del turno (máx. 2 chips)
        const stockBajos =
          ventasJ.length > 0
            ? j.despacho
                .flatMap(l => {
                  const p = productos.find(x => x.id === l.productoId)
                  return p ? [{ p, n: stockActual(j, ventasJ, p.id!) }] : []
                })
                .filter(x => x.n <= UMBRAL_REPOSICION)
                .slice(0, 2)
            : []
        const dif = j.cierre ? diferencia(j, productos) : 0
        const merma = mermaUnidades(j)
        // flag "QR en cero" solo si hay contraste con el historial (D3)
        const qr0Prom =
          j.estado !== 'abierta' && qrEnCero(j) ? promQr28(j.puestoId, j.id) : 0
        return (
          <Card key={j.id}>
            <Card.Header className="pb-0 pt-4 px-4">
              <div className="flex justify-between items-start w-full">
                <div>
                  <Card.Title className="text-base">{nomV(j.vendedorId)}</Card.Title>
                  <Card.Description>
                    {puesto ? `${puesto.nombre} · ${puesto.ubicacion}` : '?'} · fondo {j.fondoCaja != null ? fmtMoney(j.fondoCaja) : '—'}
                  </Card.Description>
                </div>
                {estadoChip(j)}
              </div>
            </Card.Header>
            <Card.Content className="px-4 py-3">
              {j.cierre ? (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-sm num">
                    <span className="text-muted">Esperado</span>
                    <b>{fmtMoney(esperado(j, productos))}</b>
                  </div>
                  <div className="flex justify-between text-sm num">
                    <span className="text-muted">Contado</span>
                    <b>{fmtMoney(cobrado(j))}</b>
                  </div>
                  <div className="flex justify-between text-sm num">
                    <span className="text-muted">Ganancia hasta ahora</span>
                    <b>{fmtMoney(gananciaReal(j, ventasJ, productos))}</b>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {dif === 0 ? (
                      <Chip color="success" variant="soft">✓ Sin diferencia</Chip>
                    ) : (
                      <Chip color={dif < 0 ? 'danger' : 'warning'} variant="soft">
                        {dif < 0 ? `⚠ Faltan ${fmtMoney(-dif)}` : `Sobran ${fmtMoney(dif)}`}
                      </Chip>
                    )}
                    {merma > 0 && <Chip color="default" variant="soft">Merma {merma} u.</Chip>}
                    {qrFueraDeCuenta(j) && (
                      <Chip color="danger" variant="soft">QR a cuenta del vendedor</Chip>
                    )}
                    {qr0Prom > 0 && (
                      <Chip color="warning" variant="soft">
                        ⚠ Declaró $0 QR — su promedio es {fmtMoney(qr0Prom)}/día
                      </Chip>
                    )}
                    {stockBajos.map(({ p, n }) => (
                      <Chip key={p.id} color="warning" variant="soft">
                        ⚠ quedan {n} {p.nombre}
                      </Chip>
                    ))}
                    <span className="text-xs text-muted self-center ml-auto">
                      cerró {fmtHora(j.cierre.cerradaAt)}
                    </span>
                  </div>
                  <Disclosure>
                    <Disclosure.Heading>
                      <Button slot="trigger" variant="ghost" size="sm">
                        Ver vendido por producto
                        <Disclosure.Indicator />
                      </Button>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                      <Disclosure.Body className="px-1 pt-1 pb-0">
                        <ul className="grid grid-cols-2 gap-x-4 text-xs text-muted">
                          {productos
                            .filter(p => vendidos(j, p.id!) > 0)
                            .map(p => (
                              <li key={p.id} className="flex justify-between num">
                                <span>{p.nombre}</span>
                                <span>{vendidos(j, p.id!)} u.</span>
                              </li>
                            ))}
                        </ul>
                      </Disclosure.Body>
                    </Disclosure.Content>
                  </Disclosure>
                  <VentasDelTurno ventas={ventasJ} productos={productos} />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted">
                    Todavía no cerró. Despacho: {j.despacho.reduce((a, l) => a + l.cantidad, 0)} u. en
                    productos.
                  </p>
                  <div className="flex justify-between text-sm num">
                    <span className="text-muted">Ganancia hasta ahora</span>
                    <b>{fmtMoney(gananciaReal(j, ventasJ, productos))}</b>
                  </div>
                  {stockBajos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {stockBajos.map(({ p, n }) => (
                        <Chip key={p.id} color="warning" variant="soft">
                          ⚠ quedan {n} {p.nombre}
                        </Chip>
                      ))}
                    </div>
                  )}
                  <VentasDelTurno ventas={ventasJ} productos={productos} />
                </div>
              )}
            </Card.Content>
            {j.estado === 'cerrada' && (
              <Card.Footer className="px-4 pb-4 pt-0">
                <AlertDialog>
                  <Button size="sm">Confirmar rendición</Button>
                  <AlertDialog.Backdrop>
                    <AlertDialog.Container>
                      <AlertDialog.Dialog className="sm:max-w-[420px]">
                        <AlertDialog.CloseTrigger />
                        <AlertDialog.Header>
                          <AlertDialog.Icon status={dif < 0 ? 'danger' : 'accent'} />
                          <AlertDialog.Heading>
                            ¿Confirmar rendición de {nomV(j.vendedorId)}?
                          </AlertDialog.Heading>
                        </AlertDialog.Header>
                        <AlertDialog.Body>
                          <div className="flex flex-col gap-1 text-sm num">
                            <div className="flex justify-between">
                              <span className="text-muted">Esperado</span>
                              <b>{fmtMoney(esperado(j, productos))}</b>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">Contado</span>
                              <b>{fmtMoney(cobrado(j))}</b>
                            </div>
                            <div className="flex justify-between font-bold">
                              <span>Diferencia</span>
                              <span className={dif < 0 ? 'text-danger' : 'text-success'}>{fmtDif(dif)}</span>
                            </div>
                          </div>
                          {qrFueraDeCuenta(j) && (
                            <p className="text-sm text-danger mt-3 font-semibold">
                              ⚠ Cobró {fmtMoney(j.cierre!.qrTotal)} en QR a su cuenta personal.
                            </p>
                          )}
                        </AlertDialog.Body>
                        <AlertDialog.Footer>
                          <Button slot="close" variant="tertiary">Volver</Button>
                          <Button slot="close" onPress={() => confirmar(j)}>
                            Confirmar
                          </Button>
                        </AlertDialog.Footer>
                      </AlertDialog.Dialog>
                    </AlertDialog.Container>
                  </AlertDialog.Backdrop>
                </AlertDialog>
              </Card.Footer>
            )}
          </Card>
        )
      })}


        </Tabs.Panel>

        <Tabs.Panel id="productos" className="flex flex-col gap-4">
          <Card>
            <Card.Header className="px-4 pt-4 pb-0">
              <Card.Title className="text-base">Productos del día</Card.Title>
              <Card.Description>Disponible = sobrante de ayer + despachado − vendido.</Card.Description>
            </Card.Header>
            <Card.Content className="px-4 py-3 flex flex-col gap-3">
              {disponibleHoy.length === 0 && (
                <EmptyState
                  titulo="Sin productos para hoy"
                  descripcion="No hay despachos cargados ni sobrantes de ayer — cargá mercadería para que los puestos tengan qué vender."
                  hint="Cargá productos con el botón +"
                />
              )}
              {disponibleHoy.map(({ p, sobranteAyer, despachado, vendido, disponible }) => {
                const total = sobranteAyer + despachado
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    {p.imagen ? (
                      <img src={p.imagen} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-accent/20 flex items-center justify-center font-bold text-accent shrink-0">{p.nombre.charAt(0)}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <b className="text-sm truncate">{p.nombre}</b>
                        <span className="num text-sm font-bold">{disponible} u.</span>
                      </div>
                      <Meter aria-label={`Disponible ${p.nombre}`} value={total > 0 ? (disponible / total) * 100 : 0} className="mt-1">
                        <Meter.Track>
                          <Meter.Fill className={disponible <= 3 ? '!bg-danger' : disponible <= total * 0.25 ? '!bg-warning' : '!bg-accent'} />
                        </Meter.Track>
                      </Meter>
                      <p className="text-[0.65rem] num text-muted mt-0.5">
                        ayer {sobranteAyer} + despacho {despachado} − vendido {vendido}
                      </p>
                    </div>
                  </div>
                )
              })}
            </Card.Content>
          </Card>
        </Tabs.Panel>
      </Tabs>
      {/* FAB: según pestaña — turno nuevo o agregar productos al día */}
      {tab === 'turnos' ? (
      <AlertDialog>
        <Button
          aria-label="Nuevo turno"
          className="!fixed right-4 !bottom-[calc(5.5rem+env(safe-area-inset-bottom))] !z-40
            !h-14 !w-14 !min-w-0 !rounded-full !p-0 !bg-accent !text-accent-foreground
            !shadow-xl !shadow-accent/30 !text-3xl !font-light !leading-none
            hover:!scale-105 active:!scale-95"
        >
          +
        </Button>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px] max-h-[85vh] overflow-y-auto">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Heading>Nuevo turno</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <div className="flex flex-col gap-3">
                  <Select
                    placeholder="Elegí el puesto"
                    selectedKey={puestoDesp != null ? String(puestoDesp) : null}
                    onSelectionChange={k => setPuestoDesp(k != null ? Number(k) : null)}
                  >
                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {puestosLibres.map(p => (
                          <ListBox.Item key={p.id} id={String(p.id)} textValue={p.nombre}>
                            {p.nombre} — {p.ubicacion}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  {puestosLibres.length === 0 && (
                    <p className="text-xs text-muted">Todos los puestos activos ya tienen turno abierto hoy.</p>
                  )}

                  <Select
                    placeholder="Vendedor"
                    selectedKey={vendTurno != null ? String(vendTurno) : null}
                    onSelectionChange={k => setVendTurno(k != null ? Number(k) : null)}
                  >
                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {libres.map(v => (
                          <ListBox.Item key={v.id} id={String(v.id)} textValue={v.nombre}>
                            {v.nombre}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <NumberField
                    value={fondoTurno}
                    onChange={v => setFondoTurno(v ?? 0)}
                    minValue={0}
                    step={1000}
                    formatOptions={{ style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }}
                  >
                    <Label>Caja inicial</Label>
                    <NumberField.Group>
                      <NumberField.DecrementButton />
                      <NumberField.Input />
                      <NumberField.IncrementButton />
                    </NumberField.Group>
                  </NumberField>

                  <TextField value={horaFinTurno} onChange={setHoraFinTurno}>
                    <Label>Fin del turno</Label>
                    <Input type="time" />
                    <p className="text-xs text-muted/70 mt-1">El vendedor puede cerrar solo hasta 5 min antes; fuera de eso te pide aprobación.</p>
                  </TextField>

                  {esPrimerTurno && sobrantesAyer.length > 0 && (
                    <div className="border border-dashed border-warning/50 rounded-xl p-3 flex flex-col gap-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted">Sobrantes de ayer</p>
                      {sobrantesAyer.map(({ p, n }) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">{p.nombre} <i className="not-italic text-xs text-muted num">×{n}</i></span>
                          <NumberField
                            className="w-28 shrink-0"
                            value={carryDe(p.id!)}
                            onChange={v => setCarryOver(prev => ({ ...prev, [p.id!]: Math.min(n, Math.max(0, v ?? 0)) }))}
                            minValue={0} maxValue={n} aria-label={`Usar ${p.nombre}`}
                          >
                            <NumberField.Group>
                              <NumberField.DecrementButton />
                              <NumberField.Input />
                              <NumberField.IncrementButton />
                            </NumberField.Group>
                          </NumberField>
                        </div>
                      ))}
                      {perdidaDescartes > 0 && (
                        <p className="text-xs num text-danger font-semibold">
                          Descarte: −{fmtMoney(perdidaDescartes)} de costo perdido
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-xs font-bold uppercase tracking-wide text-muted mt-1">
                    Productos a despachar
                  </p>
                  <div className="flex gap-2 items-end flex-wrap">
                    <Select
                      className="flex-1"
                      placeholder="Elegí un producto"
                      selectedKey={prodDesp != null ? String(prodDesp) : null}
                      onSelectionChange={k => setProdDesp(k != null ? Number(k) : null)}
                    >
                      <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {elegiblesDesp.map(p => (
                            <ListBox.Item key={p.id} id={String(p.id)} textValue={p.nombre}>
                              {p.nombre} · {fmtMoney(p.precio)}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                    <NumberField className="w-36 shrink-0" value={cantDesp} onChange={v => setCantDesp(Math.max(1, v ?? 1))} minValue={1} aria-label="Cantidad">
                      <NumberField.Group>
                        <NumberField.DecrementButton />
                        <NumberField.Input />
                        <NumberField.IncrementButton />
                      </NumberField.Group>
                    </NumberField>
                    <Button variant="primary" onPress={() => {
                      if (prodDesp == null || cantDesp <= 0) return
                      setLineasDesp(prev => [...prev, { productoId: prodDesp, cantidad: cantDesp }])
                      setProdDesp(null); setCantDesp(1)
                    }} isDisabled={prodDesp == null || cantDesp <= 0}>
                      +
                    </Button>
                  </div>
                  {lineasDesp.map(l => {
                    const p = productos.find(x => x.id === l.productoId)
                    return p ? (
                      <div key={l.productoId} className="flex justify-between items-center text-sm num">
                        <span>{p.nombre} × {l.cantidad}</span>
                        <span className="flex items-center gap-2">
                          <b>{fmtMoney(l.cantidad * p.precio)}</b>
                          <button onClick={() => setLineasDesp(prev => prev.filter(x => x.productoId !== l.productoId))} className="text-danger text-xs font-bold" aria-label={`Quitar ${p.nombre}`}>✕</button>
                        </span>
                      </div>
                    ) : null
                  })}
                  {lineasDesp.length > 0 && (
                    <div className="flex justify-between items-baseline bg-accent/8 rounded-xl px-3.5 py-2.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted">Total despacho</span>
                      <b className="text-lg num text-accent">{fmtMoney(lineasDesp.reduce((a, l) => a + l.cantidad * (productos.find(p => p.id === l.productoId)?.precio ?? 0), 0))}</b>
                    </div>
                  )}
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">Cancelar</Button>
                <Button slot="close" variant="primary" onPress={crearTurno} isDisabled={puestoDesp == null || vendTurno == null || fondoTurno <= 0 || lineasDesp.length === 0}>
                  Confirmar turno
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
      ) : (
        <AlertDialog>
          <Button
            aria-label="Agregar productos al día"
            className="!fixed right-4 !bottom-[calc(5.5rem+env(safe-area-inset-bottom))] !z-40
              !h-14 !w-14 !min-w-0 !rounded-full !p-0 !bg-accent !text-accent-foreground
              !shadow-xl !shadow-accent/30 !text-3xl !font-light !leading-none
              hover:!scale-105 active:!scale-95"
          >
            +
          </Button>
          <AlertDialog.Backdrop>
            <AlertDialog.Container>
              <AlertDialog.Dialog className="sm:max-w-[420px] max-h-[85vh] overflow-y-auto">
                <AlertDialog.CloseTrigger />
                <AlertDialog.Header>
                  <AlertDialog.Heading>Agregar productos al día</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <div className="flex flex-col gap-3">
                    <Select
                      placeholder="¿A qué puesto?"
                      selectedKey={puestoDesp != null ? String(puestoDesp) : null}
                      onSelectionChange={k => setPuestoDesp(k != null ? Number(k) : null)}
                    >
                      <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {puestosLibres.map(p => (
                            <ListBox.Item key={p.id} id={String(p.id)} textValue={p.nombre}>
                              {p.nombre} — {p.ubicacion}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                    <p className="text-xs text-muted">
                      Solo carga mercadería — el vendedor y la caja se definen al armar el turno.
                    </p>
                    <div className="flex gap-2 items-end flex-wrap">
                      <Select
                        className="flex-1"
                        placeholder="Producto"
                        selectedKey={prodDesp != null ? String(prodDesp) : null}
                        onSelectionChange={k => setProdDesp(k != null ? Number(k) : null)}
                      >
                        <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {elegiblesDesp.map(p => (
                              <ListBox.Item key={p.id} id={String(p.id)} textValue={p.nombre}>
                                {p.nombre} · {fmtMoney(p.precio)}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      <NumberField className="w-36 shrink-0" value={cantDesp} onChange={v => setCantDesp(Math.max(1, v ?? 1))} minValue={1} aria-label="Cantidad">
                        <NumberField.Group>
                          <NumberField.DecrementButton />
                          <NumberField.Input />
                          <NumberField.IncrementButton />
                        </NumberField.Group>
                      </NumberField>
                      <Button variant="primary" onPress={() => {
                        if (prodDesp == null || cantDesp <= 0) return
                        setLineasDesp(prev => [...prev, { productoId: prodDesp, cantidad: cantDesp }])
                        setProdDesp(null); setCantDesp(1)
                      }} isDisabled={prodDesp == null || cantDesp <= 0}>
                        +
                      </Button>
                    </div>
                    {lineasDesp.map(l => {
                      const p = productos.find(x => x.id === l.productoId)
                      return p ? (
                        <div key={l.productoId} className="flex justify-between items-center text-sm num">
                          <span>{p.nombre} × {l.cantidad}</span>
                          <span className="flex items-center gap-2">
                            <b>{fmtMoney(l.cantidad * p.precio)}</b>
                            <button onClick={() => setLineasDesp(prev => prev.filter(x => x.productoId !== l.productoId))} className="text-danger text-xs font-bold" aria-label={`Quitar ${p.nombre}`}>✕</button>
                          </span>
                        </div>
                      ) : null
                    })}
                  </div>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button slot="close" variant="tertiary">Cancelar</Button>
                  <Button slot="close" variant="primary" onPress={() => crearDespachoPuesto()} isDisabled={puestoDesp == null || lineasDesp.length === 0}>
                    Cargar productos
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      )}
    </div>
  )
}