import { useState } from 'react'
import { Card, Chip, Label, Meter, Tabs } from '@heroui/react'
import { useDatos, useJornadasRango, useVentasDeJornadas } from '../lib/data'
import { costoVentas, despachoValor, diferencia, horasTurno, mermaValor, perdidaDescarte, totalVentas, vendidos, ventasTotal } from '../lib/arqueo'
import { fmtFecha, fmtHora, fmtMoney, hoyISO, isoMenosDias } from '../lib/format'

const METODOS = { efectivo: 'Efectivo', qr: 'QR', transferencia: 'Transf.' } as const

export default function Historial() {
  const { productos, puestos, vendedores } = useDatos()
  const jornadas = useJornadasRango(isoMenosDias(28), isoMenosDias(0))
  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))
  const hoy = hoyISO()
  const jornadasHoy = jornadas.filter(j => j.fecha === hoy)
  const ventasHoy = ventas
    .filter(v => jornadasHoy.some(j => j.id === v.jornadaId))
    .sort((a, b) => a.createdAt - b.createdAt)
  // por producto: unidades y $ vendidas hoy (registro + conteo en cerradas)
  const hoyPorProducto = productos.map(p => {
    const uReg = ventasHoy.reduce((a, v) => a + (v.items.find(l => l.productoId === p.id)?.cantidad ?? 0), 0)
    const uConteo = jornadasHoy.filter(j => j.cierre).reduce((a, j) => a + vendidos(j, p.id!), 0)
    const u = Math.max(uReg, uConteo)
    return { p, u, total: u * p.precio }
  }).filter(x => x.u > 0).sort((a, b) => b.total - a.total)
  const maxProd = Math.max(1, ...hoyPorProducto.map(x => x.total))
  // por puesto hoy
  const hoyPorPuesto = puestos.map(p => ({
    p,
    total: jornadasHoy.filter(j => j.puestoId === p.id).reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(ventasHoy.filter(v => v.jornadaId === j.id))), 0),
  })).filter(x => x.total > 0).sort((a, b) => b.total - a.total)
  const maxPuesto = Math.max(1, ...hoyPorPuesto.map(x => x.total))
  const unidadesHoy = hoyPorProducto.reduce((a, x) => a + x.u, 0)
  const ticketMedio = ventasHoy.length ? ventasTotal(ventasHoy) / ventasHoy.length : 0
  const [tab, setTab] = useState('semana')

  // últimos 7 días para la doble entrada (puesto × día)
  const diasSem = Array.from({ length: 7 }, (_, i) => isoMenosDias(6 - i))
  const ventaCelda = (puestoId: number, fecha: string) =>
    jornadas
      .filter(j => j.puestoId === puestoId && j.fecha === fecha)
      .reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(ventas.filter(v => v.jornadaId === j.id))), 0)
  const maxCelda = Math.max(1, ...diasSem.flatMap(d => puestos.map(p => ventaCelda(p.id!, d))))
  const totalSem7 = diasSem.reduce((a, d) => a + puestos.reduce((x, p) => x + ventaCelda(p.id!, d), 0), 0)

  // merma promedio por puesto (% del despacho) — la anomalía del wedge
  const mermaPct = puestos.map(p => {
    const js = jornadas.filter(j => j.puestoId === p.id && j.cierre)
    const des = js.reduce((a, j) => a + despachoValor(j, productos), 0)
    const mer = js.reduce((a, j) => a + mermaValor(j, productos), 0)
    return { puesto: p, pct: des > 0 ? (mer / des) * 100 : 0 }
  })
  const mermaMedia = mermaPct.length ? mermaPct.reduce((a, m) => a + m.pct, 0) / mermaPct.length : 0

  // productividad por vendedor: turnos, horas, $ vendido, $/hora
  const prodVend = vendedores.map(v => {
    const js = jornadas.filter(j => j.vendedorId === v.id)
    const horas = js.reduce((a, j) => a + horasTurno(j), 0)
    const vendido = js.reduce((a, j) => a + (j.cierre ? totalVentas(j, productos) : ventasTotal(ventas.filter(x => x.jornadaId === j.id))), 0)
    const unidades = js.reduce((a, j) => a + (j.cierre ? productos.reduce((x, p) => x + vendidos(j, p.id!), 0) : ventas.filter(x => x.jornadaId === j.id).reduce((x, v) => x + v.items.reduce((y, l) => y + l.cantidad, 0), 0)), 0)
    return { v, turnos: js.length, horas, vendido, unidades, ph: horas > 0 ? vendido / horas : 0 }
  }).sort((a, b) => b.vendido - a.vendido)
  const maxPh = Math.max(1, ...prodVend.map(x => x.ph))

  // gastos vs pérdidas: costo de lo vendido + merma + faltantes vs ventas
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

  // diferencias acumuladas por puesto
  const difPor = puestos.map(p => ({
    puesto: p,
    dif: jornadas
      .filter(j => j.puestoId === p.id && j.cierre)
      .reduce((a, j) => a + diferencia(j, productos), 0),
  }))
  const difTotal = difPor.reduce((a, d) => a + d.dif, 0)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Estadísticas</h1>
        <p className="text-sm text-muted">Ventas, productividad y pérdidas — para decidir producción y pedidos.</p>
      </div>

      <Tabs selectedKey={tab} onSelectionChange={k => setTab(k as string)} className="flex flex-col gap-4">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Periodo">
            <Tabs.Tab id="semana">
              Semana
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="dia">
              Día
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="semana" className="flex flex-col gap-4">
          {/* matriz de doble entrada: puesto × día (últimos 7 días) */}
          <Card>
            <Card.Content className="p-4">
              <div className="flex justify-between items-baseline mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  Ventas por puesto y día
                </p>
                <span className="text-xs num text-muted">7 días · {fmtMoney(totalSem7)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs num">
                  <thead>
                    <tr className="text-muted/70">
                      <th className="text-left font-semibold pb-2 pr-2">Puesto</th>
                      {diasSem.map(d => (
                        <th key={d} className={`pb-2 text-center font-semibold ${d === hoy ? 'text-accent' : ''}`}>
                          {d === hoy ? 'hoy' : `${d.slice(8)}/${d.slice(5, 7)}`}
                        </th>
                      ))}
                      <th className="pb-2 text-right font-bold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {puestos.map(p => {
                      const totalP = diasSem.reduce((a, d) => a + ventaCelda(p.id!, d), 0)
                      return (
                        <tr key={p.id} className="border-t border-muted/15">
                          <td className="py-2 pr-2 font-semibold text-foreground/90 max-w-24 truncate">{p.nombre}</td>
                          {diasSem.map(d => {
                            const v = ventaCelda(p.id!, d)
                            const intensidad = v > 0 ? Math.max(0.12, v / maxCelda) : 0
                            return (
                              <td key={d} className="py-1 px-0.5 text-center">
                                <div
                                  className="rounded-md py-1.5 text-[0.65rem] font-semibold"
                                  style={{
                                    background: v > 0 ? `rgba(99,91,255,${intensidad})` : 'transparent',
                                    color: intensidad > 0.45 ? '#fff' : 'inherit',
                                  }}
                                  title={`${p.nombre} · ${fmtFecha(d)} · ${v > 0 ? fmtMoney(v) : 'sin datos'}`}
                                >
                                  {v > 0 ? fmtMoney(v) : '—'}
                                </div>
                              </td>
                            )
                          })}
                          <td className="py-2 pl-2 text-right font-bold">{fmtMoney(totalP)}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-muted/30 font-bold">
                      <td className="py-2 pr-2">Total</td>
                      {diasSem.map(d => {
                        const t = puestos.reduce((a, p) => a + ventaCelda(p.id!, d), 0)
                        return <td key={d} className="py-2 text-center">{t > 0 ? fmtMoney(t) : '—'}</td>
                      }).length && diasSem.map(d => {
                        const t = puestos.reduce((a, p) => a + ventaCelda(p.id!, d), 0)
                        return <td key={d} className="py-2 text-center">{t > 0 ? fmtMoney(t) : '—'}</td>
                      })}
                      <td className="py-2 pl-2 text-right text-accent">{fmtMoney(totalSem7)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted/60 mt-3">
                Intensidad del violeta = proporción del mejor puesto-día. Celdas sin datos en —.
              </p>
            </Card.Content>
          </Card>

          {/* merma por puesto */}
          <Card>
            <Card.Content className="p-4">
              <div className="flex justify-between items-baseline mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  Merma declarada (% de lo despachado)
                </p>
                <span className="text-xs num text-muted">media {mermaMedia.toFixed(1)}%</span>
              </div>
              <div className="flex flex-col gap-3">
                {mermaPct.map(({ puesto, pct }) => {
                  const anomalo = mermaMedia > 0 && pct > mermaMedia * 2
                  return (
                    <div key={puesto.id} className="flex items-center gap-3">
                      <Meter
                        aria-label={`Merma ${puesto.nombre}`}
                        className="flex-1"
                        value={Math.min(100, pct * 10)}
                      >
                        <Label className="text-sm font-semibold w-28 truncate">{puesto.nombre}</Label>
                        <Meter.Track>
                          <Meter.Fill className={anomalo ? '!bg-warning' : '!bg-accent'} />
                        </Meter.Track>
                      </Meter>
                      <span className={`text-sm num font-bold w-14 text-right ${anomalo ? 'text-danger' : ''}`}>
                        {pct.toFixed(1)}%
                      </span>
                      {anomalo && <Chip color="warning" variant="soft" size="sm">anomalía</Chip>}
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted/60 mt-3">
                Referencia retail: ~2,5% de ventas. Más del doble del promedio de tus puestos = anomalía.
              </p>
            </Card.Content>
          </Card>

          {/* productividad por vendedor */}
          <Card>
            <Card.Content className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">
                Productividad por vendedor · 28 días
              </p>
              <div className="flex flex-col gap-3">
                {prodVend.map(({ v, turnos, horas, vendido, unidades, ph }, i) => (
                  <div key={v.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted w-4">{i + 1}º</span>
                    <Meter aria-label={`Rendimiento ${v.nombre}`} className="flex-1" value={Math.min(100, (ph / maxPh) * 100)}>
                      <Label className="text-sm font-semibold w-24 truncate">{v.nombre}</Label>
                      <Meter.Track>
                        <Meter.Fill className={i === 0 ? '!bg-success' : '!bg-accent'} />
                      </Meter.Track>
                    </Meter>
                    <div className="text-right w-32 shrink-0">
                      <p className="text-xs num font-bold">{fmtMoney(vendido)}</p>
                      <p className="text-[0.6rem] num text-muted">{turnos}t · {horas.toFixed(0)}h · {unidades}u · {fmtMoney(Math.round(ph))}/h</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted/60 mt-3">
                $/h = vendido ÷ horas del turno. Ordenado por total vendido.
              </p>
            </Card.Content>
          </Card>

          {/* gastos vs pérdidas */}
          <Card>
            <Card.Content className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">
                Ventas vs. gastos y pérdidas · 28 días
              </p>
              <div className="flex flex-col gap-2 text-sm num">
                <div className="flex justify-between"><span className="text-muted">Vendido</span><b>{fmtMoney(totVentas)}</b></div>
                <div className="flex justify-between"><span className="text-muted">Costo producción</span><b className="text-muted">−{fmtMoney(totCosto)}</b></div>
                <div className="flex justify-between"><span className="text-muted">Merma declarada</span><b className="text-danger">−{fmtMoney(totMerma)}</b></div>
                <div className="flex justify-between"><span className="text-muted">Faltantes de caja</span><b className="text-danger">−{fmtMoney(Math.abs(totFalt))}</b></div>
                {totDescarte > 0 && (
                  <div className="flex justify-between"><span className="text-muted">Descartes de sobrantes</span><b className="text-danger">−{fmtMoney(totDescarte)}</b></div>
                )}
                {totSaldo > 0 && (
                  <div className="flex justify-between"><span className="text-muted">Sobrantes reutilizados</span><b className="text-success">+{fmtMoney(totSaldo)}</b></div>
                )}
                {totSob > 0 && (
                  <div className="flex justify-between"><span className="text-muted">Sobrantes</span><b className="text-success">+{fmtMoney(totSob)}</b></div>
                )}
                <div className="flex justify-between border-t border-dashed border-border pt-2 font-bold">
                  <span>Margen estimado</span>
                  <span className={margen - Math.abs(totFalt) < 0 ? 'text-danger' : 'text-success'}>{fmtMoney(margen + totFalt)}</span>
                </div>
              </div>
              {/* barra ventas : pérdidas */}
              <div className="mt-3">
                <div className="flex h-3 rounded-lg overflow-hidden bg-[var(--viz-track)]">
                  <div className="bg-accent" style={{ width: `${totVentas > 0 ? Math.max(0, ((totVentas - perdidas) / totVentas) * 100) : 0}%` }} />
                  <div className="bg-danger" style={{ width: `${totVentas > 0 ? Math.min(100, (perdidas / totVentas) * 100) : 0}%` }} />
                </div>
                <div className="flex justify-between mt-1.5 text-[0.65rem] text-muted">
                  <span>vendido neto</span>
                  <span className="text-danger font-semibold">pérdidas {totVentas > 0 ? ((perdidas / totVentas) * 100).toFixed(1) : 0}%</span>
                </div>
              </div>
            </Card.Content>
          </Card>

          {/* diferencias acumuladas */}
          <Card>
            <Card.Content className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">
                Faltantes/sobrantes acumulados
              </p>
              <div className="flex flex-col gap-1.5">
                {difPor.map(({ puesto, dif }) => (
                  <div key={puesto.id} className="flex justify-between text-sm">
                    <span className="font-semibold">{puesto.nombre}</span>
                    <span className={`num font-bold ${dif < 0 ? 'text-warm' : 'text-success'}`}>
                      {fmtMoney(dif)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-1.5 mt-1 border-t border-muted/20">
                  <span className="font-bold">Total</span>
                  <span className={`num font-bold ${difTotal < 0 ? 'text-warm' : 'text-success'}`}>
                    {fmtMoney(difTotal)}
                  </span>
                </div>
              </div>
            </Card.Content>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel id="dia" className="flex flex-col gap-4">
          {/* resumen del día */}
          <Card>
            <Card.Content className="p-4 grid grid-cols-3 gap-3 text-center">
              <div><p className="text-lg font-extrabold num">{fmtMoney(ventasTotal(ventasHoy))}</p><p className="text-[0.65rem] text-muted uppercase font-bold">vendido</p></div>
              <div><p className="text-lg font-extrabold num">{unidadesHoy}</p><p className="text-[0.65rem] text-muted uppercase font-bold">unidades</p></div>
              <div><p className="text-lg font-extrabold num">{fmtMoney(Math.round(ticketMedio))}</p><p className="text-[0.65rem] text-muted uppercase font-bold">ticket medio</p></div>
            </Card.Content>
          </Card>

          {/* vendido por producto hoy */}
          <Card>
            <Card.Content className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">Por producto · hoy</p>
              <div className="flex flex-col gap-2.5">
                {hoyPorProducto.length === 0 && <p className="text-sm text-muted">Sin ventas hoy.</p>}
                {hoyPorProducto.map(({ p, u, total }) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Meter aria-label={p.nombre} className="flex-1" value={(total / maxProd) * 100}>
                      <Label className="text-sm font-semibold w-28 truncate">{p.nombre}</Label>
                      <Meter.Track><Meter.Fill className="!bg-accent" /></Meter.Track>
                    </Meter>
                    <span className="text-xs num w-24 text-right">{u}u · <b>{fmtMoney(total)}</b></span>
                  </div>
                ))}
              </div>
            </Card.Content>
          </Card>

          {/* vendido por puesto hoy */}
          <Card>
            <Card.Content className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">Por puesto · hoy</p>
              <div className="flex flex-col gap-2.5">
                {hoyPorPuesto.length === 0 && <p className="text-sm text-muted">Sin ventas hoy.</p>}
                {hoyPorPuesto.map(({ p, total }) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Meter aria-label={p.nombre} className="flex-1" value={(total / maxPuesto) * 100}>
                      <Label className="text-sm font-semibold w-28 truncate">{p.nombre}</Label>
                      <Meter.Track><Meter.Fill className="!bg-[#00d4ff]" /></Meter.Track>
                    </Meter>
                    <b className="text-sm num w-24 text-right">{fmtMoney(total)}</b>
                  </div>
                ))}
              </div>
            </Card.Content>
          </Card>

          {/* timeline horario: ventas registradas hoy, en orden */}
          <Card>
            <Card.Content className="p-4">
              <div className="flex justify-between items-baseline mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  Ventas de hoy · horario
                </p>
                <span className="text-xs num text-muted">{fmtMoney(ventasTotal(ventasHoy))}</span>
              </div>
              {ventasHoy.length === 0 ? (
                <p className="text-sm text-muted">Todavía no hay ventas registradas hoy.</p>
              ) : (
                <ol className="relative border-l-2 border-accent/25 ml-2 flex flex-col gap-3">
                  {ventasHoy.map(v => {
                    const j = jornadas.find(x => x.id === v.jornadaId)
                    const puesto = puestos.find(p => p.id === j?.puestoId)
                    return (
                      <li key={v.id} className="relative pl-4">
                        <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-accent ring-4 ring-background" />
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <b className="num text-sm">{fmtHora(v.createdAt)}</b>
                          <span className="text-xs text-muted font-semibold">{puesto?.nombre ?? '—'}</span>
                          <Chip size="sm" variant="soft" color="default">{METODOS[v.metodoPago]}</Chip>
                          <b className="num text-sm ml-auto">{fmtMoney(v.total)}</b>
                        </div>
                        <p className="text-xs text-muted/70 mt-0.5">
                          {v.items.map(l => `${l.cantidad} ${productos.find(p => p.id === l.productoId)?.nombre ?? '?'}`).join(' · ')}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              )}
              <p className="text-xs text-muted/60 mt-3">
                Cada punto es una venta registrada por el vendedor durante el turno.
              </p>
            </Card.Content>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </div>
  )
}
