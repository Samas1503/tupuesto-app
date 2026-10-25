import EmptyState from '../components/EmptyState'
import { Avatar, Button, Card, Chip, Disclosure, Meter } from '@heroui/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useDatos, useJornadasRango, useVentasDeJornadas } from '../lib/data'
import { hoyISO, isoMenosDias } from '../lib/format'
import { PERIODO_SCORE_DIAS, PESOS, scoreTodos, type BreakdownScore } from '../lib/scoring'

/** semáforo del score: ≥80 verde · 60–79 ámbar · <60 rojo (clases literales para Tailwind) */
const banda = (total: number) =>
  total >= 80
    ? { text: 'text-success', fill: '!bg-success' }
    : total >= 60
      ? { text: 'text-warning', fill: '!bg-warning' }
      : { text: 'text-danger', fill: '!bg-danger' }

/** líneas del breakdown expandible — % logrado de cada componente (pts/peso) */
const LINEAS: { key: keyof Omit<BreakdownScore, 'bonus'>; label: string }[] = [
  { key: 'exactitud', label: 'Exactitud de caja' },
  { key: 'frecuencia', label: 'Frecuencia' },
  { key: 'merma', label: 'Merma / descarte' },
  { key: 'volumen', label: 'Volumen vendido' },
]

const CATEGORIAS: { id: string; label: string }[] = [
  { id: 'comida', label: 'Comida' },
  { id: 'postres', label: 'Postres' },
  { id: 'ropa', label: 'Ropa' },
  { id: 'mercaderia', label: 'Mercadería' },
  { id: 'juguetes', label: 'Juguetes' },
  { id: 'otro', label: 'Otro' },
]

/** Ranking de puntajes por rubro — SOLO ADMIN: los usuarios no ven esta vista */
export default function AdminScores() {
  const { productos, cargando } = useDatos()
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  // la ventana de datos matchea la ventana interna del scoring
  const jornadas = useJornadasRango(isoMenosDias(PERIODO_SCORE_DIAS), hoyISO())
  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))
  const solicitudes = useLiveQuery(() => db.solicitudes.toArray(), []) ?? []

  const scores = scoreTodos(usuarios, { jornadas, ventas, productos, solicitudes })
  const duenioDe = (id?: number) => usuarios.find(u => u.id === id)?.nombre ?? 'sin dueño'

  // agrupado por rubro — el vendedor hereda la categoría de su dueño
  const catDe = (u: (typeof scores)[number]['usuario']) =>
    u.rol === 'duenio' ? (u.categoria ?? 'otro') : (usuarios.find(d => d.id === u.duenioId)?.categoria ?? 'otro')
  const grupos = CATEGORIAS.map(c => ({
    ...c,
    items: scores.filter(s => catDe(s.usuario) === c.id),
  })).filter(g => g.items.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight">Puntajes</h1>
          <Chip color="warning" variant="soft" size="sm">solo admin</Chip>
        </div>
        <p className="text-sm text-muted">
          Ranking de todos los usuarios por desempeño — nadie más que vos lo ve.
          Últimos {PERIODO_SCORE_DIAS} días: exactitud 40 · frecuencia 25 · merma 15 · volumen 20 · bonus +10.
        </p>
      </div>

      {cargando && <p className="text-sm text-muted">Cargando…</p>}
      {!cargando && scores.length === 0 && (
        <Card>
          <Card.Content className="p-4">
            <p className="text-sm text-muted">Sin usuarios activos en el sistema.</p>
          </Card.Content>
        </Card>
      )}

      {grupos.length === 0 && (
        <Card><Card.Content className="p-2">
          <EmptyState icono="puntaje" titulo="Sin puntajes" descripcion="No hay usuarios con jornadas cerradas en el período — el scoring se genera cuando hay turnos confirmados." hint="Los puntajes se calculan solo para el admin"/>
        </Card.Content></Card>
      )}
      <div className="flex flex-col gap-5">
        {grupos.map(g => (
          <div key={g.id} className="flex flex-col gap-2.5">
            {/* header del rubro — chip con el color del tema de esa categoría */}
            <div className="flex items-center gap-2">
              <span data-tema={g.id} className="inline-flex">
                <Chip size="sm" className="!bg-accent !text-accent-foreground">{g.label}</Chip>
              </span>
              <span className="text-xs text-muted num">{g.items.length} usuario{g.items.length !== 1 ? 's' : ''}</span>
            </div>
            {g.items.map(({ usuario: u, total, breakdown }, i) => {
          const b = banda(total)
          return (
            <Card key={u.id}>
              <Card.Content className="px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <Avatar size="sm" color="accent" variant="soft">
                    <Avatar.Fallback>{u.nombre.trim().charAt(0).toUpperCase() || '?'}</Avatar.Fallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{i + 1}º · {u.nombre}</p>
                    <p className="text-xs text-muted truncate">
                      {u.rol === 'duenio' ? `dueño · ${u.categoria ?? 'otro'}` : `equipo de ${duenioDe(u.duenioId)}`}
                    </p>
                  </div>
                  <Chip size="sm" variant="soft" color={u.rol === 'duenio' ? 'accent' : 'default'}>
                    {u.rol === 'duenio' ? 'Dueño' : 'Vendedor'}
                  </Chip>
                  <p className={`text-3xl font-extrabold num ${b.text}`}>{total}</p>
                </div>

                <Meter value={total} aria-label={`Puntaje de ${u.nombre}`} className="w-full">
                  <Meter.Track>
                    <Meter.Fill className={b.fill} />
                  </Meter.Track>
                </Meter>

                <Disclosure>
                  <Disclosure.Heading>
                    <Button slot="trigger" variant="ghost" size="sm" className="!px-0 self-start">
                      Detalle del puntaje
                      <Disclosure.Indicator />
                    </Button>
                  </Disclosure.Heading>
                  <Disclosure.Content>
                    <Disclosure.Body className="px-1 pt-1 pb-0">
                      <div className="flex flex-col gap-1">
                        {LINEAS.map(({ key, label }) => {
                          const pts = breakdown[key]
                          const max = PESOS[key]
                          const pct = Math.round((pts / max) * 100)
                          return (
                            <div key={key} className="flex items-center justify-between text-xs">
                              <span className="text-muted">{label}</span>
                              <span className="num">
                                {Math.round(pts)}/{max} · {pct}%
                              </span>
                            </div>
                          )
                        })}
                        {breakdown.bonus > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted">Bonus — ≥3 confirmadas sin pendientes</span>
                            <span className="num font-semibold text-success">+{breakdown.bonus}</span>
                          </div>
                        )}
                      </div>
                    </Disclosure.Body>
                  </Disclosure.Content>
                </Disclosure>
              </Card.Content>
            </Card>
          )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
