import { Card, Chip, Label, Meter } from '@heroui/react'
import { useDatos, useJornadasRango } from '../lib/data'
import { despachoValor, diferencia, mermaValor, totalVentas } from '../lib/arqueo'
import { fmtMoney, isoMenosDias } from '../lib/format'

const COLORES = ['#635bff', '#00d4ff', '#25d366']

export default function Historial() {
  const { productos, puestos } = useDatos()
  const jornadas = useJornadasRango(isoMenosDias(28), isoMenosDias(0))

  // 4 buckets de 7 días (S1 = más vieja, S4 = esta semana)
  const semanas = [3, 2, 1, 0].map(w => ({
    label: w === 0 ? 'esta' : `S-${w}`,
    desde: isoMenosDias(w * 7 + 6),
    hasta: isoMenosDias(w * 7),
  }))

  const ventasPor = (puestoId: number, desde: string, hasta: string) =>
    jornadas
      .filter(j => j.puestoId === puestoId && j.fecha >= desde && j.fecha <= hasta)
      .reduce((a, j) => a + totalVentas(j, productos), 0)

  const maxSem = Math.max(
    1,
    ...semanas.flatMap(s => puestos.map(p => ventasPor(p.id!, s.desde, s.hasta))),
  )

  // merma promedio por puesto (% del despacho) — la anomalía del wedge
  const mermaPct = puestos.map(p => {
    const js = jornadas.filter(j => j.puestoId === p.id && j.cierre)
    const des = js.reduce((a, j) => a + despachoValor(j, productos), 0)
    const mer = js.reduce((a, j) => a + mermaValor(j, productos), 0)
    return { puesto: p, pct: des > 0 ? (mer / des) * 100 : 0 }
  })
  const mermaMedia = mermaPct.length ? mermaPct.reduce((a, m) => a + m.pct, 0) / mermaPct.length : 0

  // diferencias acumuladas por puesto
  const difPor = puestos.map(p => ({
    puesto: p,
    dif: jornadas
      .filter(j => j.puestoId === p.id && j.cierre)
      .reduce((a, j) => a + diferencia(j, productos), 0),
  }))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Historial</h1>
        <p className="text-sm text-muted">Últimas 4 semanas. Sirve para decidir producción y pedidos.</p>
      </div>

      {/* ventas semanales por puesto */}
      <Card>
        <Card.Content className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">Vendido por semana</p>
          <div className="flex flex-col gap-3">
            {semanas.map(s => (
              <div key={s.label} className="flex items-end gap-2">
                <span className="w-9 text-xs font-bold text-muted/60 pb-0.5">{s.label}</span>
                <div className="flex-1 flex flex-col gap-1">
                  {puestos.map((p, i) => {
                    const v = ventasPor(p.id!, s.desde, s.hasta)
                    return (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className="h-2.5 rounded-full flex-1 bg-[var(--viz-track)] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(v / maxSem) * 100}%`, background: COLORES[i % 3] }}
                          />
                        </div>
                        <span className="text-[0.7rem] num font-semibold w-16 text-right">
                          {v > 0 ? fmtMoney(v) : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {puestos.map((p, i) => (
              <span key={p.id} className="text-xs text-muted flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLORES[i % 3] }} />
                {p.nombre}
              </span>
            ))}
          </div>
        </Card.Content>
      </Card>

      {/* merma por puesto */}
      <Card>
        <Card.Content className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">
            Merma declarada (% de lo despachado)
          </p>
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
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}
