import { Card, Chip, Label, Meter } from '@heroui/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useDatos, useJornadasRango, useVentasDeJornadas } from '../lib/data'
import { ventasTotal } from '../lib/arqueo'
import { abiertasHoy, flujoPorDia, porDuenio, porMetodo, porPuesto } from '../lib/admin-metrics'
import { fmtFechaCorta, fmtHora, fmtMoney, hoyISO, isoMenosDias } from '../lib/format'
import type { Categoria, MetodoPago } from '../types'

const DIAS_RANGO = 30
const DIAS_SPARK = 14

const CATEGORIAS: Record<Categoria, string> = {
  comida: 'Comida',
  postres: 'Postres',
  ropa: 'Ropa',
  mercaderia: 'Mercadería',
  juguetes: 'Juguetes',
  otro: 'Otro',
}

const METODOS: { id: MetodoPago; label: string; dot: string }[] = [
  { id: 'efectivo', label: 'Efectivo', dot: 'bg-[var(--viz-cash)]' },
  { id: 'qr', label: 'QR', dot: 'bg-[var(--viz-qr)]' },
  { id: 'transferencia', label: 'Transf.', dot: 'bg-accent' },
]

/** Dashboard financiero del admin — ve TODO el flujo, sin scoping por dueño. Solo lectura. */
export default function AdminMoney() {
  const { puestos } = useDatos()
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const jornadas = useJornadasRango(isoMenosDias(DIAS_RANGO - 1), hoyISO())
  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))

  const totalMovido = ventasTotal(ventas)
  const flujo = flujoPorDia(ventas, DIAS_SPARK)
  const maxFlujo = Math.max(1, ...flujo.map(f => f.total))
  const duenios = porDuenio(usuarios, jornadas, ventas)
  const metodos = porMetodo(ventas)
  const ranking = porPuesto(puestos, jornadas, ventas)
  const maxPuesto = Math.max(1, ...ranking.map(x => x.ingresos))
  const abiertas = abiertasHoy(jornadas, ventas, usuarios)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Dinero</h1>
        <p className="text-sm text-muted">Flujo de toda la plataforma — sin filtrar por dueño.</p>
      </div>

      {/* $ total movido + sparkline últimos 14 días */}
      <Card>
        <Card.Content className="p-4">
          <div className="flex justify-between items-baseline">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Total movido · {DIAS_RANGO} días
            </p>
            <span className="text-xs num text-muted">{ventas.length} ventas · {jornadas.length} jornadas</span>
          </div>
          <p className="text-3xl font-extrabold num mt-1">{fmtMoney(totalMovido)}</p>
          <div className="flex items-end gap-1 h-20 mt-3" role="img" aria-label="Ventas por día, últimos 14 días">
            {flujo.map(({ fecha, total }) => (
              <div key={fecha} className="flex-1 h-full flex items-end min-w-0">
                <div
                  className={`w-full rounded-t-sm ${total > 0 ? 'bg-accent' : 'bg-[var(--viz-track)]'}`}
                  style={{ height: `${total > 0 ? Math.max(6, (total / maxFlujo) * 100) : 4}%` }}
                  title={`${fmtFechaCorta(fecha)} · ${total > 0 ? fmtMoney(total) : 'sin ventas'}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-[0.65rem] text-muted num">
            <span>{flujo.length ? fmtFechaCorta(flujo[0].fecha) : ''}</span>
            <span>últimos {DIAS_SPARK} días</span>
            <span>hoy</span>
          </div>
        </Card.Content>
      </Card>

      {/* jornadas abiertas ahora — la plata moviéndose en este momento */}
      {abiertas.length > 0 && (
        <Card>
          <Card.Content className="p-4">
            <div className="flex justify-between items-baseline mb-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Abiertas ahora</p>
              <span className="text-xs num text-muted">{fmtMoney(abiertas.reduce((a, x) => a + x.enCurso, 0))} en curso</span>
            </div>
            <div className="flex flex-col gap-2">
              {abiertas.map(({ jornada, vendedor, enCurso }) => (
                <div key={jornada.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{vendedor?.nombre ?? 'Sin vendedor'}</p>
                    <p className="text-xs text-muted truncate">
                      {puestos.find(p => p.id === jornada.puestoId)?.nombre ?? '—'} · desde {fmtHora(jornada.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Chip size="sm" variant="soft" color="success">en curso</Chip>
                    <b className="text-sm num w-20 text-right">{fmtMoney(enCurso)}</b>
                  </div>
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
      )}

      {/* por método de pago */}
      <Card>
        <Card.Content className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">
            Por método de pago · {DIAS_RANGO} días
          </p>
          <div className="grid grid-cols-3 gap-2">
            {METODOS.map(m => (
              <div key={m.id} className="rounded-xl bg-accent/8 px-3 py-2.5 text-center">
                <p className="flex items-center justify-center gap-1.5 text-[0.65rem] font-bold uppercase text-muted">
                  <span className={`h-2 w-2 rounded-full ${m.dot}`} />{m.label}
                </p>
                <p className="text-sm font-extrabold num mt-0.5">{fmtMoney(metodos[m.id].total)}</p>
                <p className="text-[0.65rem] num text-muted">{metodos[m.id].pct.toFixed(1)}% · {metodos[m.id].cantidad} ventas</p>
              </div>
            ))}
          </div>
          {/* barra apilada: proporción de cada método */}
          <div className="flex h-3 rounded-lg overflow-hidden bg-[var(--viz-track)] mt-3">
            <div className="bg-[var(--viz-cash)]" style={{ width: `${metodos.efectivo.pct}%` }} />
            <div className="bg-[var(--viz-qr)]" style={{ width: `${metodos.qr.pct}%` }} />
            <div className="bg-accent" style={{ width: `${metodos.transferencia.pct}%` }} />
          </div>
        </Card.Content>
      </Card>

      {/* por dueño */}
      <Card>
        <Card.Content className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">
            Por dueño · {DIAS_RANGO} días
          </p>
          <div className="flex flex-col gap-2.5">
            {duenios.length === 0 && <p className="text-sm text-muted">Sin dueños cargados.</p>}
            {duenios.map(d => (
              <div key={d.duenio.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{d.duenio.nombre}</p>
                  <p className="text-xs text-muted num">{d.ventas} ventas · {d.vendedores} vendedores</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Chip size="sm" variant="soft">{CATEGORIAS[d.duenio.categoria ?? 'otro']}</Chip>
                  <b className="text-sm num w-24 text-right">{fmtMoney(d.ingresos)}</b>
                </div>
              </div>
            ))}
          </div>
        </Card.Content>
      </Card>

      {/* ranking de puestos */}
      <Card>
        <Card.Content className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-3">
            Ranking de puestos · {DIAS_RANGO} días
          </p>
          <div className="flex flex-col gap-2.5">
            {ranking.length === 0 && <p className="text-sm text-muted">Sin actividad en el rango.</p>}
            {ranking.map((x, i) => (
              <div key={x.puesto.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted w-4">{i + 1}º</span>
                <Meter
                  aria-label={`Ingresos ${x.puesto.nombre}`}
                  className="flex-1"
                  value={(x.ingresos / maxPuesto) * 100}
                >
                  <Label className="text-sm font-semibold w-28 truncate">{x.puesto.nombre}</Label>
                  <Meter.Track>
                    <Meter.Fill className={i === 0 && x.ingresos > 0 ? '!bg-success' : '!bg-accent'} />
                  </Meter.Track>
                </Meter>
                <div className="text-right w-28 shrink-0">
                  <p className="text-xs num font-bold">{fmtMoney(x.ingresos)}</p>
                  <p className="text-[0.6rem] num text-muted">{x.ventas} ventas · {x.jornadas} jornadas</p>
                </div>
              </div>
            ))}
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}
