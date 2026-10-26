/** Hoy — panel del dueño. Port de views/Hoy.tsx:
 *  meta del día · turnos por jornada (solicitudes, arqueo, confirmar) ·
 *  productos del día · nuevo turno (puesto+vendedor+fondo+horaFin+sobrantes+despacho)
 *  y carga rápida de productos a un puesto sin turno. */

import React, { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { C } from '../theme'
import { Btn, Card, CardBody, CardFoot, CardHead, Chip, ConfirmSheet, EmptyState, FAB, H1, Meter, Muted, Num, Screen, Segments, Select, Sheet, Sub } from '../components/ui'
import { add, update } from '../lib/store'
import { useDatos, useJornadasDe, useJornadasRango, useSolicitudesPendientes, useVentasDeJornadas } from '../lib/data'
import { fmtDif, fmtFecha, fmtHora, fmtMoney, hoyISO, isoMenosDias } from '../lib/format'
import { cargado, cobrado, despachoValor, diferencia, esperado, gananciaReal, mermaUnidades, qrEnCero, qrFueraDeCuenta, stockActual, UMBRAL_REPOSICION, vendidos, totalVentas, ventasTotal } from '../lib/arqueo'
import { pushRow } from '../lib/snake'
import { notificar } from '../lib/notificar'
import { syncPull } from '../lib/sync'
import { useEffect } from 'react'
import type { Jornada, Linea, MetodoPago, Producto, Venta } from '../types'

const METODO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo', qr: 'QR', transferencia: 'Transf.',
}

function estadoChip(j: Jornada) {
  if (j.estado === 'abierta') return <Chip texto="Vendiendo" />
  if (j.estado === 'cerrada') return <Chip texto="Cerró — falta tu OK" color="warning" />
  return <Chip texto="Confirmada" color="success" />
}

/** detalle colapsable de las ventas registradas en el turno */
function VentasDelTurno({ ventas, productos }: { ventas: Venta[]; productos: Producto[] }) {
  const [open, setOpen] = useState(false)
  const resumen = (v: Venta) =>
    v.items.map(l => `${l.cantidad} ${productos.find(p => p.id === l.productoId)?.nombre ?? '?'}`).join(', ')
  return (
    <View>
      <Pressable onPress={() => setOpen(o => !o)}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted }}>
          Ventas del turno{ventas.length > 0 ? ` · ${ventas.length}` : ''} {open ? '▴' : '▾'}
        </Text>
      </Pressable>
      {open && (
        <View style={{ gap: 6, paddingTop: 6 }}>
          {ventas.length === 0 ? <Muted style={{ fontSize: 12 }}>Sin ventas registradas.</Muted> : ventas.map(v => (
            <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Num style={{ fontSize: 11, color: C.muted, width: 38 }}>{fmtHora(v.createdAt)}</Num>
              <Text style={{ flex: 1, fontSize: 12, color: C.muted }} numberOfLines={1}>{resumen(v)}</Text>
              <Chip texto={METODO_LABEL[v.metodoPago]} />
              <Num style={{ fontSize: 12, fontWeight: '800', color: C.navy }}>{fmtMoney(v.total)}</Num>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

export default function HoyScreen() {
  const { productos, puestos, vendedores, scope } = useDatos()
  const hoy = hoyISO()
  const jornadas = useJornadasDe(hoy)
  const ayer = isoMenosDias(1)
  const jornadasAyer = useJornadasDe(ayer)
  const [tab, setTab] = useState<'turnos' | 'productos'>('turnos')

  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))
  const solicitudes = useSolicitudesPendientes()

  // pull al montar — las solicitudes del vendedor aparecen sin esperar el loop de 30s
  useEffect(() => { void syncPull() }, [])

  const solCierreDe = (j: Jornada) =>
    solicitudes.find(s =>
      s.tipo === 'cierre-anticipado' &&
      (s.jornadaId != null ? Number(s.jornadaId) === j.id : s.vendedorId === j.vendedorId),
    )

  async function resolverCierre(solId: number, aprobar: boolean, jornadaId?: number) {
    if (aprobar && jornadaId != null) {
      update('jornadas', jornadaId, { cierreAnticipadoOk: true, estado: 'cerrada' })
      void pushRow('jornadas', jornadaId)
      update('solicitudes', solId, { estado: 'aprobada', resueltaAt: Date.now() })
    } else {
      update('solicitudes', solId, { estado: 'rechazada', resueltaAt: Date.now() })
    }
    void pushRow('solicitudes', solId)
    const sol = solicitudes.find(x => x.id === solId)
    if (sol?.vendedorId) {
      void notificar({
        usuarioId: sol.vendedorId, tipo: 'solicitud',
        titulo: aprobar ? 'Tu cierre fue aprobado' : 'Tu solicitud fue rechazada',
        descripcion: aprobar
          ? `${sol.motivo ? `"${sol.motivo}" — ` : ''}El dueño aprobó tu cierre anticipado. Podés hacer el conteo físico.`
          : 'El dueño no aprobó el cierre anticipado — seguí vendiendo hasta la hora fin.',
      })
    }
  }

  // productos del día
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

  const rango28 = useJornadasRango(isoMenosDias(28), hoy)

  const nomV = (id: number | undefined) => vendedores.find(v => v.id === id)?.nombre ?? 'sin asignar'

  // nuevo turno / carga de productos — estado de los modales
  const [modalTurno, setModalTurno] = useState(false)
  const [modalProdDia, setModalProdDia] = useState(false)
  const [puestoDesp, setPuestoDesp] = useState<string | null>(null)
  const [vendTurno, setVendTurno] = useState<string | null>(null)
  const [fondoTurno, setFondoTurno] = useState(0)
  const [horaFinTurno, setHoraFinTurno] = useState('')
  const [carryOver, setCarryOver] = useState<Record<number, number>>({})
  const [lineasDesp, setLineasDesp] = useState<Linea[]>([])
  const [prodDesp, setProdDesp] = useState<string | null>(null)
  const [cantDesp, setCantDesp] = useState(1)
  const [confirmarJ, setConfirmarJ] = useState<Jornada | null>(null)

  const sobrantesAyer = productos.map(p => ({
    p,
    n: jornadasAyer.reduce((a, j) => a + (j.cierre?.remanente.find(l => l.productoId === p.id)?.cantidad ?? 0), 0),
  })).filter(x => x.n > 0)
  const esPrimerTurno = jornadas.length === 0
  const carryDe = (pid: number) => carryOver[pid] ?? (sobrantesAyer.find(x => x.p.id === pid)?.n ?? 0)
  const perdidaDescartes = sobrantesAyer.reduce((a, x) => a + (x.n - carryDe(x.p.id!)) * (x.p.precioCosto ?? 0), 0)
  const saldoIni = sobrantesAyer.map(x => ({ productoId: x.p.id!, cantidad: carryDe(x.p.id!) })).filter(l => l.cantidad > 0)
  const descarte = sobrantesAyer.map(x => ({ productoId: x.p.id!, cantidad: x.n - carryDe(x.p.id!) })).filter(l => l.cantidad > 0)

  const puestosLibres = puestos.filter(p => p.activo && !jornadas.some(j => j.puestoId === p.id && j.estado === 'abierta'))
  const elegiblesDesp = productos.filter(p => p.activo && !lineasDesp.some(l => l.productoId === p.id))
  const ocupados = new Set(jornadas.filter(j => j.estado !== 'confirmada').map(j => j.vendedorId).filter(Boolean))
  const libres = vendedores.filter(v => v.activo && !ocupados.has(v.id!))

  function limpiarForm() {
    setPuestoDesp(null); setVendTurno(null); setFondoTurno(0); setHoraFinTurno('')
    setLineasDesp([]); setProdDesp(null); setCantDesp(1)
  }

  async function crearDespachoPuesto() {
    const p = puestos.find(x => x.id === Number(puestoDesp))
    if (!p || lineasDesp.length === 0) return
    const jid = add('jornadas', {
      duenioId: scope ?? undefined,
      puestoId: p.id!,
      fecha: hoy,
      despacho: lineasDesp,
      estado: 'abierta',
      createdAt: Date.now(),
    })
    void pushRow('jornadas', jid)
    limpiarForm()
    setModalProdDia(false)
  }

  async function crearTurno() {
    const p = puestos.find(x => x.id === Number(puestoDesp))
    const v = vendedores.find(x => x.id === Number(vendTurno))
    if (!p || !v || fondoTurno <= 0 || lineasDesp.length === 0) return
    const jid = add('jornadas', {
      duenioId: scope ?? undefined,
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
    limpiarForm()
    setModalTurno(false)
  }

  const promQr28 = (puestoId: number, excluirId?: number) => {
    const js = rango28.filter(x => x.puestoId === puestoId && x.cierre && x.id !== excluirId)
    return js.length ? js.reduce((a, x) => a + x.cierre!.qrTotal, 0) / js.length : 0
  }

  const metaDia = jornadas.reduce((a, j) => a + despachoValor(j, productos), 0)
  const vendidoDia = jornadas.reduce((a, j) => {
    if (j.cierre) return a + totalVentas(j, productos)
    const vj = ventas.filter(v => v.jornadaId === j.id)
    return a + ventasTotal(vj)
  }, 0)
  const avanceDia = Math.min(100, metaDia > 0 ? (vendidoDia / metaDia) * 100 : 0)

  const cerradas = jornadas.filter(j => j.cierre)
  const totEfe = cerradas.reduce((a, j) => a + j.cierre!.efectivoContado, 0)
  const totQrNeg = cerradas.filter(j => j.cierre!.qrDestino === 'negocio').reduce((a, j) => a + j.cierre!.qrTotal, 0)
  const totQrVend = cerradas.filter(j => j.cierre!.qrDestino === 'vendedor').reduce((a, j) => a + j.cierre!.qrTotal, 0)
  const totDif = cerradas.reduce((a, j) => a + diferencia(j, productos), 0)

  async function confirmar(j: Jornada) {
    update('jornadas', j.id!, { estado: 'confirmada', confirmadaAt: Date.now() })
    void pushRow('jornadas', j.id!)
  }

  // formulario de productos del despacho (compartido por ambos modales)
  const formLineas = (
    <>
      <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 0.4, marginTop: 4 }}>
        PRODUCTOS A DESPACHAR
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <Select
          placeholder="Producto"
          value={prodDesp}
          onChange={setProdDesp}
          opciones={elegiblesDesp.map(p => ({ id: String(p.id), label: `${p.nombre} · ${fmtMoney(p.precio)}` }))}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable onPress={() => setCantDesp(c => Math.max(1, c - 1))} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: C.muted }}>−</Text>
          </Pressable>
          <Num style={{ width: 30, textAlign: 'center', fontWeight: '800', color: C.navy, fontSize: 15 }}>{cantDesp}</Num>
          <Pressable onPress={() => setCantDesp(c => c + 1)} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: C.muted }}>+</Text>
          </Pressable>
        </View>
        <Btn sm onPress={() => {
          if (prodDesp == null || cantDesp <= 0) return
          setLineasDesp(prev => [...prev, { productoId: Number(prodDesp), cantidad: cantDesp }])
          setProdDesp(null); setCantDesp(1)
        }} disabled={prodDesp == null || cantDesp <= 0}>+</Btn>
      </View>
      {lineasDesp.map(l => {
        const p = productos.find(x => x.id === l.productoId)
        return p ? (
          <View key={l.productoId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Num style={{ fontSize: 13, color: C.navy }}>{p.nombre} × {l.cantidad}</Num>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>{fmtMoney(l.cantidad * p.precio)}</Num>
              <Pressable onPress={() => setLineasDesp(prev => prev.filter(x => x.productoId !== l.productoId))} hitSlop={6}>
                <Text style={{ color: C.danger, fontWeight: '800', fontSize: 12 }}>✕</Text>
              </Pressable>
            </View>
          </View>
        ) : null
      })}
      {lineasDesp.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#635bff14', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Muted style={{ fontSize: 11, fontWeight: '700' }}>TOTAL DESPACHO</Muted>
          <Num style={{ fontSize: 16, fontWeight: '800', color: C.blurple }}>
            {fmtMoney(lineasDesp.reduce((a, l) => a + l.cantidad * (productos.find(p => p.id === l.productoId)?.precio ?? 0), 0))}
          </Num>
        </View>
      )}
    </>
  )

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <H1>Hoy</H1>
        <Sub style={{ textTransform: 'capitalize', fontWeight: '700' }}>{fmtFecha(hoy)}</Sub>
      </View>

      {/* meta del día */}
      {jornadas.length > 0 && (
        <Card><CardBody>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Muted style={{ fontSize: 11, fontWeight: '800' }}>COBRADO HOY</Muted>
            <Num style={{ fontSize: 11, color: C.muted }}>{Math.round(avanceDia)}%</Num>
          </View>
          <Meter pct={avanceDia} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Num style={{ fontSize: 11, color: C.muted }}>{fmtMoney(vendidoDia)} vendido</Num>
            <Num style={{ fontSize: 11, color: C.muted }}>meta {fmtMoney(metaDia)}</Num>
          </View>
          {cerradas.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border, borderStyle: 'dashed' }}>
              <Num style={{ fontSize: 11, color: C.muted }}>Efectivo {fmtMoney(totEfe)}</Num>
              <Num style={{ fontSize: 11, color: C.muted }}>QR a tu cuenta {fmtMoney(totQrNeg)}</Num>
              {totQrVend > 0 && <Num style={{ fontSize: 11, color: C.danger, fontWeight: '700' }}>QR a vendedor {fmtMoney(totQrVend)}</Num>}
              <Num style={{ fontSize: 11, fontWeight: '800', color: totDif < 0 ? C.danger : C.success }}>{fmtDif(totDif)}</Num>
            </View>
          )}
        </CardBody></Card>
      )}

      <Segments
        opciones={[{ id: 'turnos', label: 'Turnos' }, { id: 'productos', label: 'Productos' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'turnos' && (
        <>
          {jornadas.length === 0 && (
            <Card><CardBody>
              <EmptyState titulo="Sin turnos hoy" descripcion="Todavía no creaste ningún turno — cada puesto necesita su vendedor, caja y despacho para arrancar." hint="Creá el primero con el botón +" />
            </CardBody></Card>
          )}
          {jornadas.map(j => {
            const puesto = puestos.find(p => p.id === j.puestoId)
            const ventasJ = ventas.filter(v => v.jornadaId === j.id)
            const stockBajos = ventasJ.length > 0
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
            const qr0Prom = j.estado !== 'abierta' && qrEnCero(j) ? promQr28(j.puestoId, j.id) : 0
            const sol = solCierreDe(j)
            return (
              <Card key={j.id}>
                <CardHead
                  title={nomV(j.vendedorId)}
                  desc={`${puesto ? `${puesto.nombre} · ${puesto.ubicacion}` : '?'} · fondo ${j.fondoCaja != null ? fmtMoney(j.fondoCaja) : '—'}`}
                  right={estadoChip(j)}
                />
                <CardBody>
                  {sol && (
                    <View style={{ backgroundColor: '#f59e4214', borderWidth: 1, borderColor: '#f59e424d', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#92600a' }}>
                        {nomV(sol.vendedorId)} pidió terminar antes de las {j.horaFin ?? '—'}
                      </Text>
                      {sol.motivo != null && <Muted style={{ fontSize: 12 }}>"{sol.motivo}"</Muted>}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Btn sm flex onPress={() => resolverCierre(sol.id!, true, j.id)}>Aprobar</Btn>
                        <Btn sm flex variant="danger-soft" onPress={() => resolverCierre(sol.id!, false)}>Rechazar</Btn>
                      </View>
                    </View>
                  )}
                  {j.cierre ? (
                    <View style={{ gap: 8 }}>
                      <Fila label="Esperado" valor={fmtMoney(esperado(j, productos))} />
                      <Fila label="Contado" valor={fmtMoney(cobrado(j))} />
                      <Fila label="Ganancia hasta ahora" valor={fmtMoney(gananciaReal(j, ventasJ, productos))} />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        {dif === 0 ? <Chip texto="✓ Sin diferencia" color="success" />
                          : <Chip texto={dif < 0 ? `⚠ Faltan ${fmtMoney(-dif)}` : `Sobran ${fmtMoney(dif)}`} color={dif < 0 ? 'danger' : 'warning'} />}
                        {merma > 0 && <Chip texto={`Merma ${merma} u.`} />}
                        {qrFueraDeCuenta(j) && <Chip texto="QR a cuenta del vendedor" color="danger" />}
                        {qr0Prom > 0 && <Chip texto={`⚠ Declaró $0 QR — su promedio es ${fmtMoney(qr0Prom)}/día`} color="warning" />}
                        {stockBajos.map(({ p, n }) => <Chip key={p.id} texto={`⚠ quedan ${n} ${p.nombre}`} color="warning" />)}
                        <Muted style={{ fontSize: 11, marginLeft: 'auto' }}>cerró {fmtHora(j.cierre.cerradaAt)}</Muted>
                      </View>
                      <DetalleColapsable titulo="Ver vendido por producto">
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {productos.filter(p => vendidos(j, p.id!) > 0).map(p => (
                            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', width: '47%' }}>
                              <Muted style={{ fontSize: 11 }}>{p.nombre}</Muted>
                              <Num style={{ fontSize: 11, color: C.navy }}>{vendidos(j, p.id!)} u.</Num>
                            </View>
                          ))}
                        </View>
                      </DetalleColapsable>
                      <VentasDelTurno ventas={ventasJ} productos={productos} />
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      <Muted style={{ fontSize: 13 }}>
                        Todavía no cerró. Despacho: {j.despacho.reduce((a, l) => a + l.cantidad, 0)} u. en productos.
                      </Muted>
                      <Fila label="Ganancia hasta ahora" valor={fmtMoney(gananciaReal(j, ventasJ, productos))} />
                      {stockBajos.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {stockBajos.map(({ p, n }) => <Chip key={p.id} texto={`⚠ quedan ${n} ${p.nombre}`} color="warning" />)}
                        </View>
                      )}
                      <VentasDelTurno ventas={ventasJ} productos={productos} />
                    </View>
                  )}
                </CardBody>
                {j.estado === 'cerrada' && (
                  <CardFoot>
                    <Btn sm onPress={() => setConfirmarJ(j)}>Confirmar rendición</Btn>
                  </CardFoot>
                )}
              </Card>
            )
          })}
        </>
      )}

      {tab === 'productos' && (
        <Card>
          <CardHead title="Productos del día" desc="Disponible = sobrante de ayer + despachado − vendido." />
          <CardBody>
            {disponibleHoy.length === 0 && (
              <EmptyState titulo="Sin productos para hoy" descripcion="No hay despachos cargados ni sobrantes de ayer — cargá mercadería para que los puestos tengan qué vender." hint="Cargá productos con el botón +" />
            )}
            {disponibleHoy.map(({ p, sobranteAyer, despachado, vendido, disponible }) => {
              const total = sobranteAyer + despachado
              const pct = total > 0 ? (disponible / total) * 100 : 0
              return (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ height: 38, width: 38, borderRadius: 10, backgroundColor: '#635bff26', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontWeight: '800', color: C.blurple }}>{p.nombre.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }} numberOfLines={1}>{p.nombre}</Text>
                      <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>{disponible} u.</Num>
                    </View>
                    <Meter pct={pct} color={disponible <= 3 ? C.danger : disponible <= total * 0.25 ? C.warning : undefined} />
                    <Num style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      ayer {sobranteAyer} + despacho {despachado} − vendido {vendido}
                    </Num>
                  </View>
                </View>
              )
            })}
          </CardBody>
        </Card>
      )}

      {/* FAB según pestaña */}
      <FAB onPress={() => tab === 'turnos' ? setModalTurno(true) : setModalProdDia(true)} />

      {/* modal: nuevo turno */}
      <Sheet visible={modalTurno} onClose={() => { setModalTurno(false); limpiarForm() }} title="Nuevo turno"
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => { setModalTurno(false); limpiarForm() }}>Cancelar</Btn>
            <Btn flex disabled={puestoDesp == null || vendTurno == null || fondoTurno <= 0 || lineasDesp.length === 0} onPress={crearTurno}>Confirmar turno</Btn>
          </>
        }>
        <Select
          placeholder="Elegí el puesto"
          value={puestoDesp}
          onChange={setPuestoDesp}
          opciones={puestosLibres.map(p => ({ id: String(p.id), label: `${p.nombre} — ${p.ubicacion}` }))}
        />
        {puestosLibres.length === 0 && <Muted style={{ fontSize: 11 }}>Todos los puestos activos ya tienen turno abierto hoy.</Muted>}
        <Select
          placeholder="Vendedor"
          value={vendTurno}
          onChange={setVendTurno}
          opciones={libres.map(v => ({ id: String(v.id), label: v.nombre }))}
        />
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase' }}>Caja inicial</Text>
          <TextInput
            value={fondoTurno === 0 ? '' : String(fondoTurno)}
            onChangeText={v => setFondoTurno(Number(v.replace(/[^\d]/g, '')) || 0)}
            placeholder="$0" keyboardType="number-pad"
            style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.navy, fontVariant: ['tabular-nums'] }}
          />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase' }}>Fin del turno (HH:mm)</Text>
          <TextInput
            value={horaFinTurno}
            onChangeText={v => setHoraFinTurno(v.replace(/[^\d:]/g, '').slice(0, 5))}
            placeholder="20:00" keyboardType="numbers-and-punctuation"
            style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.navy }}
          />
          <Muted style={{ fontSize: 11 }}>El vendedor puede cerrar solo hasta 5 min antes; fuera de eso te pide aprobación.</Muted>
        </View>
        {esPrimerTurno && sobrantesAyer.length > 0 && (
          <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#f59e4280', borderRadius: 12, padding: 12, gap: 8 }}>
            <Muted style={{ fontSize: 11, fontWeight: '800' }}>SOBRANTES DE AYER</Muted>
            {sobrantesAyer.map(({ p, n }) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontSize: 13, color: C.navy, flex: 1 }} numberOfLines={1}>
                  {p.nombre} <Num style={{ fontSize: 11, color: C.muted }}>×{n}</Num>
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Pressable onPress={() => setCarryOver(prev => ({ ...prev, [p.id!]: Math.max(0, carryDe(p.id!) - 1) }))} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontWeight: '800', color: C.muted }}>−</Text>
                  </Pressable>
                  <Num style={{ width: 30, textAlign: 'center', fontWeight: '800', color: C.navy }}>{carryDe(p.id!)}</Num>
                  <Pressable onPress={() => setCarryOver(prev => ({ ...prev, [p.id!]: Math.min(n, carryDe(p.id!) + 1) }))} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontWeight: '800', color: C.muted }}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {perdidaDescartes > 0 && (
              <Num style={{ fontSize: 11, color: C.danger, fontWeight: '700' }}>
                Descarte: −{fmtMoney(perdidaDescartes)} de costo perdido
              </Num>
            )}
          </View>
        )}
        {formLineas}
      </Sheet>

      {/* modal: agregar productos al día (sin vendedor ni caja) */}
      <Sheet visible={modalProdDia} onClose={() => { setModalProdDia(false); limpiarForm() }} title="Agregar productos al día"
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => { setModalProdDia(false); limpiarForm() }}>Cancelar</Btn>
            <Btn flex disabled={puestoDesp == null || lineasDesp.length === 0} onPress={crearDespachoPuesto}>Cargar productos</Btn>
          </>
        }>
        <Select
          placeholder="¿A qué puesto?"
          value={puestoDesp}
          onChange={setPuestoDesp}
          opciones={puestosLibres.map(p => ({ id: String(p.id), label: `${p.nombre} — ${p.ubicacion}` }))}
        />
        <Muted style={{ fontSize: 11 }}>Solo carga mercadería — el vendedor y la caja se definen al armar el turno.</Muted>
        {formLineas}
      </Sheet>

      {/* confirmar rendición */}
      <ConfirmSheet
        visible={confirmarJ != null}
        onClose={() => setConfirmarJ(null)}
        titulo={`¿Confirmar rendición de ${confirmarJ ? nomV(confirmarJ.vendedorId) : ''}?`}
        onOk={() => confirmarJ && void confirmar(confirmarJ)}
      >
        {confirmarJ && (
          <View style={{ gap: 6 }}>
            <Fila label="Esperado" valor={fmtMoney(esperado(confirmarJ, productos))} />
            <Fila label="Contado" valor={fmtMoney(cobrado(confirmarJ))} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>Diferencia</Text>
              <Num style={{ fontSize: 13, fontWeight: '800', color: diferencia(confirmarJ, productos) < 0 ? C.danger : C.success }}>
                {fmtDif(diferencia(confirmarJ, productos))}
              </Num>
            </View>
            {qrFueraDeCuenta(confirmarJ) && (
              <Text style={{ fontSize: 13, color: C.danger, fontWeight: '700', marginTop: 6 }}>
                ⚠ Cobró {fmtMoney(confirmarJ.cierre!.qrTotal)} en QR a su cuenta personal.
              </Text>
            )}
          </View>
        )}
      </ConfirmSheet>
    </Screen>
  )
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Muted style={{ fontSize: 13 }}>{label}</Muted>
      <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>{valor}</Num>
    </View>
  )
}

function DetalleColapsable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <View>
      <Pressable onPress={() => setOpen(o => !o)}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted }}>{titulo} {open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && <View style={{ paddingTop: 6 }}>{children}</View>}
    </View>
  )
}
