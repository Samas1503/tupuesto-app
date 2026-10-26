/** Estadísticas del dueño — port de views/Historial.tsx (versión compacta):
 *  matriz puesto × día (7d) · merma % por puesto · productividad por vendedor ·
 *  ventas vs pérdidas · diferencias acumuladas · tab Día (por producto/puesto). */

import React, { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { C } from '../theme'
import { Card, CardBody, Chip, H1, Meter, Muted, Num, Screen, Segments, Sub } from '../components/ui'
import { useDatos, useJornadasRango, useVentasDeJornadas } from '../lib/data'
import { costoVentas, despachoValor, diferencia, horasTurno, mermaValor, perdidaDescarte, totalVentas, vendidos, ventasTotal } from '../lib/arqueo'
import { fmtFecha, fmtMoney, hoyISO, isoMenosDias } from '../lib/format'

export default function StatsScreen() {
  const { productos, puestos, vendedores } = useDatos()
  const jornadas = useJornadasRango(isoMenosDias(28), hoyISO())
  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))
  const hoy = hoyISO()
  const [tab, setTab] = useState<'semana' | 'dia'>('semana')

  const jornadasHoy = jornadas.filter(j => j.fecha === hoy)
  const ventasHoy = ventas
    .filter(v => jornadasHoy.some(j => j.id === v.jornadaId))
    .sort((a, b) => a.createdAt - b.createdAt)
  const hoyPorProducto = productos.map(p => {
    const uReg = ventasHoy.reduce((a, v) => a + (v.items.find(l => l.productoId === p.id)?.cantidad ?? 0), 0)
    const uConteo = jornadasHoy.filter(j => j.cierre).reduce((a, j) => a + vendidos(j, p.id!), 0)
    const u = Math.max(uReg, uConteo)
    return { p, u, total: u * p.precio }
  }).filter(x => x.u > 0).sort((a, b) => b.total - a.total)
  const maxProd = Math.max(1, ...hoyPorProducto.map(x => x.total))
  const hoyPorPuesto = puestos.map(p => ({
    p,
    total: jornadasHoy.filter(j => j.puestoId === p.id).reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(ventasHoy.filter(v => v.jornadaId === j.id))), 0),
  })).filter(x => x.total > 0).sort((a, b) => b.total - a.total)
  const maxPuesto = Math.max(1, ...hoyPorPuesto.map(x => x.total))
  const unidadesHoy = hoyPorProducto.reduce((a, x) => a + x.u, 0)
  const ticketMedio = ventasHoy.length ? ventasTotal(ventasHoy) / ventasHoy.length : 0

  const diasSem = Array.from({ length: 7 }, (_, i) => isoMenosDias(6 - i))
  const ventaCelda = (puestoId: number, fecha: string) =>
    jornadas
      .filter(j => j.puestoId === puestoId && j.fecha === fecha)
      .reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(ventas.filter(v => v.jornadaId === j.id))), 0)
  const maxCelda = Math.max(1, ...diasSem.flatMap(d => puestos.map(p => ventaCelda(p.id!, d))))
  const totalSem7 = diasSem.reduce((a, d) => a + puestos.reduce((x, p) => x + ventaCelda(p.id!, d), 0), 0)

  const mermaPct = puestos.map(p => {
    const js = jornadas.filter(j => j.puestoId === p.id && j.cierre)
    const des = js.reduce((a, j) => a + despachoValor(j, productos), 0)
    const mer = js.reduce((a, j) => a + mermaValor(j, productos), 0)
    return { puesto: p, pct: des > 0 ? (mer / des) * 100 : 0 }
  })
  const mermaMedia = mermaPct.length ? mermaPct.reduce((a, m) => a + m.pct, 0) / mermaPct.length : 0

  const prodVend = vendedores.map(v => {
    const js = jornadas.filter(j => j.vendedorId === v.id)
    const horas = js.reduce((a, j) => a + horasTurno(j), 0)
    const vendido = js.reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(ventas.filter(x => x.jornadaId === j.id))), 0)
    const unidades = js.reduce((a, j) => a + (j.cierre ? productos.reduce((x, p) => x + vendidos(j, p.id!), 0) : ventas.filter(x => x.jornadaId === j.id).reduce((x, v) => x + v.items.reduce((y, l) => y + l.cantidad, 0), 0)), 0)
    return { v, turnos: js.length, horas, vendido, unidades, ph: horas > 0 ? vendido / horas : 0 }
  }).sort((a, b) => b.vendido - a.vendido)
  const maxPh = Math.max(1, ...prodVend.map(x => x.ph))

  const jsConCierre = jornadas.filter(j => j.cierre)
  const totVentas = jsConCierre.reduce((a, j) => a + totalVentas(j, productos), 0)
  const totCosto = jsConCierre.reduce((a, j) => a + costoVentas(j, productos), 0)
  const totMerma = jsConCierre.reduce((a, j) => a + mermaValor(j, productos), 0)
  const totFalt = jsConCierre.reduce((a, j) => a + Math.min(0, diferencia(j, productos)), 0)
  const totSob = jsConCierre.reduce((a, j) => a + Math.max(0, diferencia(j, productos)), 0)
  const margen = totVentas - totCosto
  const totDescarte = jornadas.reduce((a, j) => a + perdidaDescarte(j, productos), 0)
  const totSaldo = jornadas.reduce((a, j) =>
    a + (j.saldoInicial ?? []).reduce((x, l) => x + l.cantidad * (productos.find(p => p.id === l.productoId)?.precioCosto ?? 0), 0), 0)
  const perdidas = totMerma + Math.abs(totFalt) + totDescarte

  const difPor = puestos.map(p => ({
    puesto: p,
    dif: jornadas.filter(j => j.puestoId === p.id && j.cierre).reduce((a, j) => a + diferencia(j, productos), 0),
  }))
  const difTotal = difPor.reduce((a, d) => a + d.dif, 0)

  return (
    <Screen>
      <View>
        <H1>Estadísticas</H1>
        <Sub>Ventas, productividad y pérdidas — para decidir producción y pedidos.</Sub>
      </View>

      <Segments
        opciones={[{ id: 'semana', label: 'Semana' }, { id: 'dia', label: 'Día' }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'semana' && (
        <>
          {/* matriz puesto × día */}
          <Card><CardBody>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Muted style={{ fontSize: 11, fontWeight: '800' }}>VENTAS POR PUESTO Y DÍA</Muted>
              <Num style={{ fontSize: 11, color: C.muted }}>7 días · {fmtMoney(totalSem7)}</Num>
            </View>
            <ScrollView horizontal>
              <View>
                <View style={{ flexDirection: 'row', paddingBottom: 6 }}>
                  <Text style={{ width: 90, fontSize: 11, fontWeight: '700', color: C.muted }}>Puesto</Text>
                  {diasSem.map(d => (
                    <Text key={d} style={{ width: 62, textAlign: 'center', fontSize: 11, fontWeight: '700', color: d === hoy ? C.blurple : C.muted }}>
                      {d === hoy ? 'hoy' : `${d.slice(8)}/${d.slice(5, 7)}`}
                    </Text>
                  ))}
                  <Text style={{ width: 70, textAlign: 'right', fontSize: 11, fontWeight: '800', color: C.navy }}>Total</Text>
                </View>
                {puestos.map(p => {
                  const totalP = diasSem.reduce((a, d) => a + ventaCelda(p.id!, d), 0)
                  return (
                    <View key={p.id} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#42546626', alignItems: 'center', paddingVertical: 3 }}>
                      <Text style={{ width: 90, fontSize: 11, fontWeight: '700', color: C.navy }} numberOfLines={1}>{p.nombre}</Text>
                      {diasSem.map(d => {
                        const v = ventaCelda(p.id!, d)
                        const int = v > 0 ? Math.max(0.12, v / maxCelda) : 0
                        return (
                          <View key={d} style={{ width: 62, paddingHorizontal: 2 }}>
                            <View style={{ borderRadius: 6, paddingVertical: 4, backgroundColor: v > 0 ? `rgba(99,91,255,${int.toFixed(2)})` : 'transparent' }}>
                              <Num style={{ fontSize: 9, textAlign: 'center', fontWeight: '700', color: int > 0.45 ? '#fff' : C.navy }} lines={1}>
                                {v > 0 ? fmtMoney(v) : '—'}
                              </Num>
                            </View>
                          </View>
                        )
                      })}
                      <Num style={{ width: 70, textAlign: 'right', fontSize: 11, fontWeight: '800', color: C.navy }}>{fmtMoney(totalP)}</Num>
                    </View>
                  )
                })}
                <View style={{ flexDirection: 'row', borderTopWidth: 2, borderTopColor: '#4254664d', paddingVertical: 4 }}>
                  <Text style={{ width: 90, fontSize: 11, fontWeight: '800', color: C.navy }}>Total</Text>
                  {diasSem.map(d => {
                    const t = puestos.reduce((a, p) => a + ventaCelda(p.id!, d), 0)
                    return <Num key={d} style={{ width: 62, textAlign: 'center', fontSize: 10, fontWeight: '800', color: C.navy }}>{t > 0 ? fmtMoney(t) : '—'}</Num>
                  })}
                  <Num style={{ width: 70, textAlign: 'right', fontSize: 11, fontWeight: '800', color: C.blurple }}>{fmtMoney(totalSem7)}</Num>
                </View>
              </View>
            </ScrollView>
            <Muted style={{ fontSize: 10, marginTop: 4 }}>Intensidad del violeta = proporción del mejor puesto-día.</Muted>
          </CardBody></Card>

          {/* merma por puesto */}
          <Card><CardBody>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Muted style={{ fontSize: 11, fontWeight: '800' }}>MERMA DECLARADA (% DEL DESPACHO)</Muted>
              <Num style={{ fontSize: 11, color: C.muted }}>media {mermaMedia.toFixed(1)}%</Num>
            </View>
            {mermaPct.map(({ puesto, pct }) => {
              const anomalo = mermaMedia > 0 && pct > mermaMedia * 2
              return (
                <View key={puesto.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ width: 90, fontSize: 12, fontWeight: '700', color: C.navy }} numberOfLines={1}>{puesto.nombre}</Text>
                  <Meter pct={Math.min(100, pct * 10)} color={anomalo ? C.warning : undefined} />
                  <Num style={{ width: 50, textAlign: 'right', fontSize: 12, fontWeight: '800', color: anomalo ? C.danger : C.navy }}>{pct.toFixed(1)}%</Num>
                  {anomalo && <Chip texto="anomalía" color="warning" />}
                </View>
              )
            })}
            <Muted style={{ fontSize: 10, marginTop: 4 }}>Referencia retail: ~2,5% de ventas. Más del doble del promedio = anomalía.</Muted>
          </CardBody></Card>

          {/* productividad por vendedor */}
          <Card><CardBody>
            <Muted style={{ fontSize: 11, fontWeight: '800', marginBottom: 6 }}>PRODUCTIVIDAD POR VENDEDOR · 28 DÍAS</Muted>
            {prodVend.map(({ v, turnos, horas, vendido, unidades, ph }, i) => (
              <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ width: 16, fontSize: 11, fontWeight: '800', color: C.muted }}>{i + 1}º</Text>
                <Text style={{ width: 90, fontSize: 12, fontWeight: '700', color: C.navy }} numberOfLines={1}>{v.nombre}</Text>
                <Meter pct={Math.min(100, (ph / maxPh) * 100)} color={i === 0 ? C.success : undefined} />
                <View style={{ width: 110 }}>
                  <Num style={{ fontSize: 11, fontWeight: '800', color: C.navy, textAlign: 'right' }}>{fmtMoney(vendido)}</Num>
                  <Num style={{ fontSize: 9, color: C.muted, textAlign: 'right' }}>{turnos}t · {horas.toFixed(0)}h · {unidades}u · {fmtMoney(Math.round(ph))}/h</Num>
                </View>
              </View>
            ))}
          </CardBody></Card>

          {/* ventas vs pérdidas */}
          <Card><CardBody>
            <Muted style={{ fontSize: 11, fontWeight: '800', marginBottom: 6 }}>VENTAS VS. GASTOS Y PÉRDIDAS · 28 DÍAS</Muted>
            {([
              ['Vendido', fmtMoney(totVentas), C.navy] as const,
              ['Costo producción', `−${fmtMoney(totCosto)}`, C.muted] as const,
              ['Merma declarada', `−${fmtMoney(totMerma)}`, C.danger] as const,
              ['Faltantes de caja', `−${fmtMoney(Math.abs(totFalt))}`, C.danger] as const,
            ]).map(([l, v, col]) => (
              <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Muted style={{ fontSize: 13 }}>{l}</Muted>
                <Num style={{ fontSize: 13, fontWeight: '800', color: col }}>{v}</Num>
              </View>
            ))}
            {totDescarte > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Muted style={{ fontSize: 13 }}>Descartes de sobrantes</Muted>
                <Num style={{ fontSize: 13, fontWeight: '800', color: C.danger }}>−{fmtMoney(totDescarte)}</Num>
              </View>
            )}
            {totSaldo > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Muted style={{ fontSize: 13 }}>Sobrantes reutilizados</Muted>
                <Num style={{ fontSize: 13, fontWeight: '800', color: C.success }}>+{fmtMoney(totSaldo)}</Num>
              </View>
            )}
            {totSob > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Muted style={{ fontSize: 13 }}>Sobrantes</Muted>
                <Num style={{ fontSize: 13, fontWeight: '800', color: C.success }}>+{fmtMoney(totSob)}</Num>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, borderStyle: 'dashed', paddingTop: 6, marginTop: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>Margen estimado</Text>
              <Num style={{ fontSize: 13, fontWeight: '800', color: margen - Math.abs(totFalt) < 0 ? C.danger : C.success }}>
                {fmtMoney(margen + totFalt)}
              </Num>
            </View>
            <View style={{ marginTop: 6 }}>
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', backgroundColor: C.vizTrack }}>
                <View style={{ width: `${totVentas > 0 ? Math.max(0, ((totVentas - perdidas) / totVentas) * 100) : 0}%`, backgroundColor: C.blurple }} />
                <View style={{ width: `${totVentas > 0 ? Math.min(100, (perdidas / totVentas) * 100) : 0}%`, backgroundColor: C.danger }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Muted style={{ fontSize: 10 }}>vendido neto</Muted>
                <Text style={{ fontSize: 10, color: C.danger, fontWeight: '700' }}>pérdidas {totVentas > 0 ? ((perdidas / totVentas) * 100).toFixed(1) : 0}%</Text>
              </View>
            </View>
          </CardBody></Card>

          {/* diferencias acumuladas */}
          <Card><CardBody>
            <Muted style={{ fontSize: 11, fontWeight: '800', marginBottom: 6 }}>FALTANTES/SOBRANTES ACUMULADOS</Muted>
            {difPor.map(({ puesto, dif }) => (
              <View key={puesto.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>{puesto.nombre}</Text>
                <Num style={{ fontSize: 13, fontWeight: '800', color: dif < 0 ? C.danger : C.success }}>{fmtMoney(dif)}</Num>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#42546633', paddingTop: 6, marginTop: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>Total</Text>
              <Num style={{ fontSize: 13, fontWeight: '800', color: difTotal < 0 ? C.danger : C.success }}>{fmtMoney(difTotal)}</Num>
            </View>
          </CardBody></Card>
        </>
      )}

      {tab === 'dia' && (
        <>
          <Card><CardBody style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {([
              ['vendido', fmtMoney(ventasTotal(ventasHoy))],
              ['unidades', String(unidadesHoy)],
              ['ticket medio', fmtMoney(Math.round(ticketMedio))],
            ] as const).map(([k, val]) => (
              <View key={k} style={{ alignItems: 'center' }}>
                <Num style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>{val}</Num>
                <Text style={{ fontSize: 10, color: C.muted, fontWeight: '700', textTransform: 'uppercase' }}>{k}</Text>
              </View>
            ))}
          </CardBody></Card>

          <Card><CardBody>
            <Muted style={{ fontSize: 11, fontWeight: '800', marginBottom: 6 }}>POR PRODUCTO · HOY</Muted>
            {hoyPorProducto.length === 0 && <Muted style={{ fontSize: 13 }}>Sin ventas hoy.</Muted>}
            {hoyPorProducto.map(({ p, u, total }) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ width: 100, fontSize: 12, fontWeight: '700', color: C.navy }} numberOfLines={1}>{p.nombre}</Text>
                <Meter pct={(total / maxProd) * 100} />
                <Num style={{ width: 90, textAlign: 'right', fontSize: 11, color: C.navy }}>{u}u · {fmtMoney(total)}</Num>
              </View>
            ))}
          </CardBody></Card>

          <Card><CardBody>
            <Muted style={{ fontSize: 11, fontWeight: '800', marginBottom: 6 }}>POR PUESTO · HOY</Muted>
            {hoyPorPuesto.length === 0 && <Muted style={{ fontSize: 13 }}>Sin ventas hoy.</Muted>}
            {hoyPorPuesto.map(({ p, total }) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ width: 100, fontSize: 12, fontWeight: '700', color: C.navy }} numberOfLines={1}>{p.nombre}</Text>
                <Meter pct={(total / maxPuesto) * 100} />
                <Num style={{ width: 90, textAlign: 'right', fontSize: 11, fontWeight: '800', color: C.navy }}>{fmtMoney(total)}</Num>
              </View>
            ))}
          </CardBody></Card>
        </>
      )}
    </Screen>
  )
}
