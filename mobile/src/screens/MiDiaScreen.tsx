/** Mi día — vista del vendedor. Port de views/MiDia.tsx:
 *  tomar turno libre · boleta multi-item con método de pago · stock del turno ·
 *  cierre automático por conteo (remanente = despacho − registrado) ·
 *  solicitud de cierre anticipado · historial propio. */

import React, { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C } from '../theme'
import { Btn, Card, CardBody, CardHead, Chip, EmptyState, Field, H1, Muted, Num, Screen, Segments, Sheet, Sub } from '../components/ui'
import { add, all, update } from '../lib/store'
import { useDatos, useJornadasLibres, useJornadaVendedor, useVentasDe } from '../lib/data'
import { cargado, despachoValor, horasTurno, perdidaDescarte, repuestas, stockActual, totalVentas, vendidos, vendidosRegistrados, ventasTotal } from '../lib/arqueo'
import { fmtFecha, fmtHora, fmtMoney, hoyISO } from '../lib/format'
import { pushRow } from '../lib/snake'
import { notificar } from '../lib/notificar'
import { sesionActual } from '../lib/auth'
import type { Cierre, Jornada, Linea, MetodoPago, Producto, Venta } from '../types'

const METODOS: { id: MetodoPago; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'qr', label: 'QR' },
  { id: 'transferencia', label: 'Transf.' },
]

function chipMetodo(m: MetodoPago) {
  const label = m === 'efectivo' ? 'Efectivo' : m === 'qr' ? 'QR' : 'Transf.'
  const color = m === 'efectivo' ? 'success' : m === 'qr' ? 'accent' : 'default'
  return <Chip texto={label} color={color} />
}

export default function MiDiaScreen() {
  const insets = useSafeAreaInsets()
  const { productos, puestos, usuarios } = useDatos()
  const vendedorId = sesionActual()?.id ?? null
  const hoy = hoyISO()
  const jornada = useJornadaVendedor(vendedorId, hoy)
  const ventas = useVentasDe(jornada?.id)
  const puesto = jornada ? puestos.find(p => p.id === jornada.puestoId) : undefined
  const libres = useJornadasLibres(hoy)

  const [nota, setNota] = useState('')
  const [fondoTurno, setFondoTurno] = useState(0)
  const [solCierre, setSolCierre] = useState(false)
  const [motivoCierre, setMotivoCierre] = useState('')
  const [solCierreEnviada, setSolCierreEnviada] = useState(false)
  const [listo, setListo] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)

  // boleta en curso
  const [boleta, setBoleta] = useState<Linea[]>([])
  const [boletaAbierta, setBoletaAbierta] = useState(false)
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [metodoBoleta, setMetodoBoleta] = useState<MetodoPago>(metodoPago)
  // modal por producto
  const [prodSel, setProdSel] = useState<Producto | null>(null)
  const [cantProd, setCantProd] = useState(1)

  const totalBoleta = boleta.reduce((a, l) => a + l.cantidad * (productos.find(p => p.id === l.productoId)?.precio ?? 0), 0)

  const misJornadas = vendedorId == null ? [] : [...all('jornadas')]
    .filter(j => j.vendedorId === vendedorId)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  const misVentas = all('ventas').filter(v => misJornadas.some(j => j.id === v.jornadaId))

  // ventana de cierre normal: [horaFin − 5 min, en adelante] o si el dueño aprobó anticipado
  const puedeCerrar = (() => {
    if (!jornada?.horaFin || jornada.cierreAnticipadoOk) return true
    const [h, m] = jornada.horaFin.split(':').map(Number)
    const fin = new Date()
    fin.setHours(h, m - 5, 0, 0)
    return Date.now() >= fin.getTime()
  })()

  const duenioDe = () =>
    jornada?.duenioId ?? usuarios.find(u => u.id === vendedorId)?.duenioId

  async function solicitarCierre() {
    if (vendedorId == null || jornada?.id == null || !motivoCierre.trim()) return
    const solId = add('solicitudes', {
      tipo: 'cierre-anticipado',
      jornadaId: jornada.id,
      vendedorId,
      solicitadoPor: vendedorId,
      motivo: motivoCierre.trim(),
      estado: 'pendiente',
      createdAt: Date.now(),
    })
    void pushRow('solicitudes', solId)
    const dId = duenioDe()
    if (dId) void notificar({
      usuarioId: dId, tipo: 'solicitud',
      titulo: `${usuarios.find(u => u.id === vendedorId)?.nombre ?? 'El vendedor'} pidió terminar antes`,
      descripcion: motivoCierre.trim(),
    })
    setSolCierreEnviada(true)
    setMotivoCierre('')
    setSolCierre(false)
  }

  async function tomarTurno(jornadaId: number) {
    update('jornadas', jornadaId, { vendedorId: vendedorId ?? undefined, fondoCaja: fondoTurno })
    void pushRow('jornadas', jornadaId)
    setFondoTurno(0)
  }

  function ajustarBoleta(pid: number, delta: number) {
    if (!jornada) return
    const max = stockActual(jornada, ventas, pid)
    setBoleta(prev => prev
      .map(l => l.productoId === pid ? { ...l, cantidad: Math.min(max, Math.max(0, l.cantidad + delta)) } : l)
      .filter(l => l.cantidad > 0))
  }

  function agregarABoleta(p: Producto, cantidad: number) {
    setBoleta(prev => {
      const i = prev.findIndex(l => l.productoId === p.id)
      const max = jornada ? stockActual(jornada, ventas, p.id!) : cantidad
      if (i >= 0) {
        const n = [...prev]
        n[i] = { ...n[i], cantidad: Math.min(max, n[i].cantidad + cantidad) }
        return n
      }
      return [...prev, { productoId: p.id!, cantidad: Math.min(max, cantidad) }]
    })
  }

  async function confirmarBoleta() {
    if (!jornada || boleta.length === 0) return
    const items = boleta.map(l => ({ productoId: l.productoId, cantidad: l.cantidad }))
    const ventaId = add('ventas', {
      jornadaId: jornada.id!,
      items,
      total: totalBoleta,
      metodoPago: metodoBoleta,
      createdAt: Date.now(),
    })
    void pushRow('ventas', ventaId)
    // stock bajo → aviso al dueño por cada producto al 20% o menos del stock del día
    const vendidoAntes = ventas.map(v => v.items).flat()
    for (const p of productos.filter(x => x.stockDia != null && x.stockDia > 0)) {
      const vendidas = [...(jornada.despacho ?? []), ...vendidoAntes]
        .filter(l => l.productoId === p.id).reduce((a, l) => a + l.cantidad, 0)
      const restante = (p.stockDia ?? 0) - vendidas
      const umbral = Math.max(1, Math.ceil((p.stockDia ?? 0) * 0.2))
      if (restante <= umbral && restante >= 0) {
        const dId = duenioDe()
        if (dId) void notificar({
          usuarioId: dId, tipo: 'stock',
          titulo: `Queda poco ${p.nombre}`,
          descripcion: `${restante} unidades restantes de ${p.stockDia} del día.`,
        })
      }
    }
    setBoleta([])
    setBoletaAbierta(false)
    setMetodoPago(metodoBoleta)
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
    update('jornadas', jornada.id!, { cierre, estado: 'cerrada' })
    void pushRow('jornadas', jornada.id!)
    const dId = duenioDe()
    if (dId) void notificar({
      usuarioId: dId, tipo: 'cierre',
      titulo: `${usuarios.find(u => u.id === vendedorId)?.nombre ?? 'El vendedor'} cerró el turno`,
      descripcion: 'Cierre registrado — revisá el arqueo en Hoy.',
    })
    setListo(true)
  }

  const sinTurno = jornada == null || jornada.estado === 'confirmada'

  return (
    <Screen>
      <View>
        <H1>Mi día</H1>
        <Sub style={{ textTransform: 'capitalize' }}>{fmtFecha(hoy)}</Sub>
      </View>

      {/* turnos sin asignar → tomar */}
      {vendedorId != null && sinTurno && (libres.length > 0 ? (
        <Card>
          <CardHead title="Turnos sin asignar" desc="Tomá el tuyo — se vincula a tu cuenta y fijás el fondo que recibiste." />
          <CardBody>
            {libres.map(jl => {
              const pl = puestos.find(x => x.id === jl.puestoId)
              return (
                <View key={jl.id} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{pl?.nombre}</Text>
                    <Muted style={{ fontSize: 11 }}>{pl?.ubicacion}</Muted>
                  </View>
                  <Muted style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
                    {jl.despacho.length} productos · valor {fmtMoney(despachoValor(jl, productos))}
                  </Muted>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 4 }}>FONDO RECIBIDO</Text>
                      <TextInput
                        value={fondoTurno === 0 ? '' : String(fondoTurno)}
                        onChangeText={v => setFondoTurno(Number(v.replace(/[^\d]/g, '')) || 0)}
                        placeholder="$0"
                        keyboardType="number-pad"
                        style={{ borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: C.navy }}
                      />
                    </View>
                    <Btn sm onPress={() => tomarTurno(jl.id!)} disabled={fondoTurno <= 0}>Empezar turno</Btn>
                  </View>
                </View>
              )
            })}
          </CardBody>
        </Card>
      ) : (
        <Card><CardBody>
          <EmptyState
            titulo={jornada?.estado === 'confirmada' ? 'Turno terminado' : 'Hoy no tenés jornada'}
            descripcion={jornada?.estado === 'confirmada'
              ? 'El dueño confirmó tu rendición. Podés tomar otro turno o volver mañana.'
              : 'El dueño todavía no cargó ningún despacho del día.'}
          />
        </CardBody></Card>
      ))}

      {vendedorId != null && sinTurno && (
        <MiHistorial misJornadas={misJornadas} misVentas={misVentas} productos={productos} puestos={puestos} />
      )}

      {jornada && puesto && jornada.estado !== 'confirmada' && (
        <>
          {/* ── VENDER ── */}
          <Card>
            <CardHead title="Vender" desc={`${puesto.nombre} · fondo ${fmtMoney(jornada.fondoCaja ?? 0)} · tocá un producto para anotar`} />
            <CardBody>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {jornada.despacho.map(l => {
                  const p = productos.find(x => x.id === l.productoId)
                  if (!p) return null
                  const stock = Math.max(0, stockActual(jornada, ventas, p.id!) - (boleta.find(b => b.productoId === p.id!)?.cantidad ?? 0))
                  const agotado = stock <= 0
                  const habilitado = jornada.estado === 'abierta' && !listo
                  const rep = repuestas(jornada, p.id!)
                  return (
                    <Pressable
                      key={p.id}
                      disabled={!habilitado || agotado}
                      onPress={() => { setProdSel(p); setCantProd(1) }}
                      style={({ pressed }) => [{
                        flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderColor: C.border,
                        borderRadius: 12, padding: 10, backgroundColor: C.surface,
                        opacity: !habilitado || agotado ? 0.4 : 1,
                      }, pressed && { opacity: 0.7 }]}
                    >
                      <View style={{ height: 44, borderRadius: 8, backgroundColor: '#635bff26', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: C.blurple }}>{p.nombre.charAt(0)}</Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }} numberOfLines={1}>{p.nombre}</Text>
                      {p.ingredientes != null && <Text style={{ fontSize: 9, color: C.muted, opacity: 0.7 }} numberOfLines={1}>{p.ingredientes}</Text>}
                      <Num style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                        {`llevaste ${l.cantidad}${rep > 0 ? ` +${rep}` : ''} · quedan ${stock}`}
                      </Num>
                      <Num style={{ fontSize: 12, fontWeight: '800', color: C.blurple }}>{fmtMoney(p.precio)}</Num>
                    </Pressable>
                  )
                })}
              </View>
            </CardBody>
          </Card>

          {/* ── MI TURNO ── */}
          <Card>
            <CardHead title="Mi turno" desc="Lo que anotaste vendiendo hoy." />
            <CardBody>
              {jornada.descarte != null && jornada.descarte.length > 0 && (
                <Num style={{ fontSize: 11, color: C.danger, fontWeight: '700' }}>
                  Descarte de ayer: −{fmtMoney(perdidaDescarte(jornada, productos))}
                </Num>
              )}
              {jornada.despacho.map(l => {
                const p = productos.find(x => x.id === l.productoId)
                return p ? (
                  <View key={l.productoId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ fontSize: 13, color: C.navy }}>{p.nombre}</Text>
                    <Num style={{ fontSize: 12, color: C.muted, flexShrink: 1, textAlign: 'right' }}>
                      {`recibí ${l.cantidad}${repuestas(jornada, l.productoId) > 0 ? ` · +${repuestas(jornada, l.productoId)} repuestas` : ''} · quedé con ${stockActual(jornada, ventas, l.productoId)}`}
                    </Num>
                  </View>
                ) : null
              })}
              <View style={{ borderTopWidth: 1, borderTopColor: C.border, borderStyle: 'dashed', paddingTop: 10, gap: 6 }}>
                {ventas.length === 0 ? (
                  <Muted style={{ fontSize: 13 }}>Todavía no anotaste ventas.</Muted>
                ) : (
                  [...ventas].reverse().map(v => (
                    <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Num style={{ fontSize: 11, color: C.muted, width: 38 }}>{fmtHora(v.createdAt)}</Num>
                      <Text style={{ flex: 1, fontSize: 12, color: C.navy }} numberOfLines={1}>
                        {v.items.map(l => `${l.cantidad} ${productos.find(p => p.id === l.productoId)?.nombre ?? '?'}`).join(', ')}
                      </Text>
                      {chipMetodo(v.metodoPago)}
                      <Num style={{ fontSize: 12, fontWeight: '800', color: C.navy }}>{fmtMoney(v.total)}</Num>
                    </View>
                  ))
                )}
              </View>
              {ventas.length > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>Anotado hoy</Text>
                  <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>{fmtMoney(ventasTotal(ventas))}</Num>
                </View>
              )}
            </CardBody>
          </Card>

          {/* historial propio — toggle durante el turno */}
          <Pressable onPress={() => setVerHistorial(v => !v)} style={{ alignSelf: 'center' }}>
            <Text style={{ fontSize: 11, color: C.muted, textDecorationLine: 'underline', opacity: 0.8 }}>
              {verHistorial ? 'Ocultar mi historial' : 'Ver mi historial'}
            </Text>
          </Pressable>
          {verHistorial && (
            <MiHistorial misJornadas={misJornadas} misVentas={misVentas} productos={productos} puestos={puestos} />
          )}

          {/* ── CIERRE ── */}
          {jornada.estado === 'abierta' && !listo && (
            <Card>
              <CardHead title="Cerrar el día" desc="Se calcula solo con lo que anotaste. Solo dejá una nota si hace falta." />
              <CardBody>
                <Field label="Nota (opcional)" value={nota} onChange={setNota} placeholder="Ej: llovió, vendí menos" />
                {puedeCerrar ? (
                  <Btn onPress={cerrarDia}>Cerrar el día</Btn>
                ) : solCierreEnviada ? (
                  <Muted style={{ fontSize: 11, textAlign: 'center' }}>
                    Pediste el cierre — cuando el dueño lo apruebe, acá aparece el botón.
                  </Muted>
                ) : (
                  <Pressable onPress={() => setSolCierre(true)} style={{ alignSelf: 'center' }}>
                    <Text style={{ fontSize: 11, color: C.muted, textDecorationLine: 'underline', opacity: 0.8 }}>
                      ¿Terminaste antes? Pedí el cierre
                    </Text>
                  </Pressable>
                )}
              </CardBody>
            </Card>
          )}

          {(jornada.estado === 'cerrada' || listo) && (
            <Card style={{ borderColor: '#f59e4266', backgroundColor: '#f59e4210' }}>
              <CardBody>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#92600a' }}>Enviado</Text>
                <Muted style={{ fontSize: 12 }}>
                  Cerraste a las {jornada.cierre ? fmtHora(jornada.cierre.cerradaAt) : '—'}. El dueño confirma la rendición.
                </Muted>
              </CardBody>
            </Card>
          )}
        </>
      )}

      {/* boleta flotante */}
      {boleta.length > 0 && (
        <Pressable
          onPress={() => { setMetodoBoleta(metodoPago); setBoletaAbierta(true) }}
          style={{
            position: 'absolute', left: 16, right: 16, bottom: 16 + insets.bottom,
            backgroundColor: C.blurple, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            shadowColor: C.blurple, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
            🧾 Boleta · {boleta.reduce((a, l) => a + l.cantidad, 0)} u.
          </Text>
          <Num style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{fmtMoney(totalBoleta)}</Num>
        </Pressable>
      )}

      {/* modal: producto → cantidad → a la boleta */}
      <Sheet visible={prodSel != null} onClose={() => setProdSel(null)} title={prodSel?.nombre ?? ''}
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => setProdSel(null)}>Cancelar</Btn>
            <Btn flex disabled={cantProd <= 0 || (jornada != null && prodSel != null && cantProd > stockActual(jornada, ventas, prodSel.id!))}
              onPress={() => { if (prodSel) agregarABoleta(prodSel, cantProd); setProdSel(null); setCantProd(1) }}>
              Agregar a la boleta
            </Btn>
          </>
        }>
        {prodSel && jornada && (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Muted style={{ fontSize: 11, fontWeight: '700' }}>PRECIO</Muted>
              <Num style={{ fontSize: 14, color: C.navy }}>{fmtMoney(prodSel.precio)} /u.</Num>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable onPress={() => setCantProd(c => Math.max(1, c - 1))} style={{ width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: C.muted }}>−</Text>
              </Pressable>
              <TextInput
                value={String(cantProd)}
                onChangeText={v => setCantProd(Math.min(stockActual(jornada, ventas, prodSel.id!), Math.max(1, Number(v.replace(/[^\d]/g, '')) || 1)))}
                keyboardType="number-pad"
                style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: C.navy, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 6 }}
              />
              <Pressable onPress={() => setCantProd(c => Math.min(stockActual(jornada, ventas, prodSel.id!), c + 1))} style={{ width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: C.muted }}>+</Text>
              </Pressable>
              <Btn sm variant="outline" onPress={() => setCantProd(stockActual(jornada, ventas, prodSel.id!))}>
                Todo {stockActual(jornada, ventas, prodSel.id!)}
              </Btn>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#635bff14', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Muted style={{ fontSize: 11, fontWeight: '700' }}>SUBTOTAL</Muted>
              <Num style={{ fontSize: 17, fontWeight: '800', color: C.blurple }}>{fmtMoney(cantProd * prodSel.precio)}</Num>
            </View>
          </View>
        )}
      </Sheet>

      {/* modal: boleta → método + confirmar */}
      <Sheet visible={boletaAbierta} onClose={() => setBoletaAbierta(false)} title={`Boleta — ${boleta.length} ${boleta.length === 1 ? 'producto' : 'productos'}`}
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => setBoletaAbierta(false)}>Seguir agregando</Btn>
            <Btn flex disabled={boleta.length === 0} onPress={confirmarBoleta}>Confirmar venta</Btn>
          </>
        }>
        {boleta.map(l => {
          const p = productos.find(x => x.id === l.productoId)
          return p ? (
            <View key={l.productoId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, color: C.navy }} numberOfLines={1}>{p.nombre}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Pressable onPress={() => ajustarBoleta(l.productoId, -1)} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontWeight: '800', color: C.muted }}>−</Text>
                </Pressable>
                <Num style={{ width: 26, textAlign: 'center', fontWeight: '800', color: C.navy }}>{l.cantidad}</Num>
                <Pressable onPress={() => ajustarBoleta(l.productoId, 1)} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontWeight: '800', color: C.muted }}>+</Text>
                </Pressable>
              </View>
              <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy, width: 64, textAlign: 'right' }}>{fmtMoney(l.cantidad * p.precio)}</Num>
              <Pressable onPress={() => setBoleta(prev => prev.filter(x => x.productoId !== l.productoId))} hitSlop={6}>
                <Text style={{ color: C.danger, fontWeight: '800', fontSize: 12 }}>✕</Text>
              </Pressable>
            </View>
          ) : null
        })}
        <Segments opciones={METODOS} value={metodoBoleta} onChange={setMetodoBoleta} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#635bff14', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Muted style={{ fontSize: 11, fontWeight: '700' }}>TOTAL</Muted>
          <Num style={{ fontSize: 17, fontWeight: '800', color: C.blurple }}>{fmtMoney(totalBoleta)}</Num>
        </View>
      </Sheet>

      {/* modal: cierre anticipado */}
      <Sheet visible={solCierre} onClose={() => setSolCierre(false)} title="Pedir cierre anticipado"
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => setSolCierre(false)}>Cancelar</Btn>
            <Btn flex disabled={!motivoCierre.trim()} onPress={solicitarCierre}>Enviar solicitud</Btn>
          </>
        }>
        <Muted style={{ fontSize: 13 }}>
          El turno cierra a las <Num style={{ fontWeight: '700', color: C.navy }}>{jornada?.horaFin}</Num>. Para cerrar antes,
          tu motivo le llega al dueño — si lo aprueba, se habilita el botón.
        </Muted>
        <Field label="Motivo" value={motivoCierre} onChange={setMotivoCierre} placeholder="Ej: llovió y no hay gente" />
      </Sheet>
    </Screen>
  )
}

/* ── historial propio: stats + jornadas por fecha ── */
function MiHistorial({
  misJornadas, misVentas, productos, puestos,
}: {
  misJornadas: Jornada[]
  misVentas: Venta[]
  productos: Producto[]
  puestos: { id?: number; nombre: string }[]
}) {
  const stats = {
    turnos: misJornadas.filter(j => j.cierre).length,
    horas: misJornadas.reduce((a, j) => a + horasTurno(j), 0),
    unidades: misJornadas.reduce((a, j) => a + productos.reduce((x, p) => x + (j.cierre ? vendidos(j, p.id!) : vendidosRegistrados(misVentas.filter(v => v.jornadaId === j.id), p.id!)), 0), 0),
    vendido: misJornadas.reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(misVentas.filter(v => v.jornadaId === j.id))), 0),
  }
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
      <CardHead title="Mi historial" desc="Tus números hasta la fecha — productos por turno." />
      <CardBody>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {([
            ['turnos', String(stats.turnos)],
            ['horas', `${stats.horas.toFixed(0)}h`],
            ['unidades', String(stats.unidades)],
            ['vendido', fmtMoney(stats.vendido)],
          ] as const).map(([k, val]) => (
            <View key={k} style={{ alignItems: 'center' }}>
              <Num style={{ fontSize: 15, fontWeight: '800', color: C.navy }}>{val}</Num>
              <Text style={{ fontSize: 9, color: C.muted, fontWeight: '700', textTransform: 'uppercase' }}>{k}</Text>
            </View>
          ))}
        </View>
        {fechas.length === 0 && <EmptyState titulo="Sin historial" descripcion="Todavía no tenés jornadas registradas." />}
        {fechas.map(fecha => {
          const js = porFecha.get(fecha)!
          const totalDia = js.reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(misVentas.filter(v => v.jornadaId === j.id))), 0)
          return (
            <View key={fecha} style={{ borderTopWidth: 1, borderTopColor: C.border, borderStyle: 'dashed', paddingTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'capitalize', color: C.navy }}>{fmtFecha(fecha)}</Text>
                <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>{fmtMoney(totalDia)}</Num>
              </View>
              {js.map((j, turno) => {
                const p = puestos.find(x => x.id === j.puestoId)
                const prods = productos.map(pp => ({ pp, u: vendidoDe(j, pp.id!) })).filter(x => x.u > 0)
                const total = j.cierre ? totalVentas(j, productos) : ventasTotal(misVentas.filter(v => v.jornadaId === j.id))
                return (
                  <View key={j.id} style={{ marginBottom: 6, borderRadius: 10, backgroundColor: '#4254660d', borderWidth: 1, borderColor: '#e6ebf180', padding: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.navy }}>
                        {p?.nombre ?? '—'}{js.length > 1 ? ` · turno ${turno + 1}` : ''}
                      </Text>
                      <Chip
                        texto={j.estado === 'confirmada' ? 'confirmada' : j.estado === 'cerrada' ? 'cerrada' : 'en curso'}
                        color={j.estado === 'confirmada' ? 'success' : j.estado === 'cerrada' ? 'warning' : 'default'}
                      />
                    </View>
                    {prods.length > 0 ? prods.map(({ pp, u }) => (
                      <View key={pp.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Muted style={{ fontSize: 11 }}>{pp.nombre}</Muted>
                        <Num style={{ fontSize: 11, color: C.navy }}>{u}u · {fmtMoney(u * pp.precio)}</Num>
                      </View>
                    )) : <Muted style={{ fontSize: 10, opacity: 0.6 }}>sin ventas todavía</Muted>}
                    <Num style={{ fontSize: 11, fontWeight: '800', color: C.blurple, textAlign: 'right', marginTop: 2 }}>{fmtMoney(total)}</Num>
                  </View>
                )
              })}
            </View>
          )
        })}
      </CardBody>
    </Card>
  )
}
