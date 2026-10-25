import { Card } from '@heroui/react'
import { useDatos, useJornadasRango, useVentasDeJornadas } from '../lib/data'
import { planDe } from '../lib/planes'
import { fmtMoney, isoMenosDias, hoyISO } from '../lib/format'
import EmptyState from '../components/EmptyState'

/** Reportes avanzados — solo plan Premium */
export default function Reportes() {
  const { productos, usuarios, cargando } = useDatos()
  const sesion = usuarios?.find(u => u.id === Number(localStorage.getItem('tp-user-id')))
  const plan = planDe(sesion?.plan)
  const jornadas = useJornadasRango(isoMenosDias(30), hoyISO())
  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))

  if (cargando) return <p className="text-sm text-muted py-8 text-center">Cargando…</p>

  // solo premium
  if (plan.id !== 'premium') {
    return (
      <Card><Card.Content className="p-2">
        <EmptyState
          titulo="Reportes avanzados — Premium"
          descripcion={`Esta sección es exclusiva del plan Premium. Tu plan actual es ${plan.nombre} — los reportes avanzados incluyen proyecciones de venta, análisis de merma y comparativas por vendedor.`}
          hint="Contactanos para hacer el upgrade"
        />
      </Card.Content></Card>
    )
  }

  // proyección: promedio de venta diaria últimas 4 semanas → próximos 7 días
  const diasConVenta = new Set(ventas.map(v => new Date(v.createdAt).toISOString().slice(0, 10))).size || 1
  const totalMes = ventas.reduce((a, v) => a + v.total, 0)
  const promedioDia = totalMes / Math.max(diasConVenta, 1)
  const proyeccion7d = promedioDia * 7

  // merma: diferencia de stock en jornadas cerradas (saldo esperado vs contado)
  const merma = jornadas.reduce((a, j) => a + (j.cierre?.descartado ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Reportes avanzados</h1>
      <Card><Card.Content className="p-4">
        <p className="text-xs text-muted mb-1">Proyección próximos 7 días (promedio de {diasConVenta} días con venta)</p>
        <p className="text-2xl font-extrabold num">{fmtMoney(proyeccion7d)}</p>
      </Card.Content></Card>
      <Card><Card.Content className="p-4">
        <p className="text-xs text-muted mb-1">Merma del mes (descartado)</p>
        <p className="text-2xl font-extrabold num">{merma} u.</p>
      </Card.Content></Card>
      <Card><Card.Content className="p-4">
        <p className="text-xs text-muted mb-2">Ventas del mes por producto</p>
        <ul className="flex flex-col gap-1.5">
          {productos.map(p => {
            const t = ventas.reduce((a, v) => a + v.items.filter(i => i.productoId === p.id).reduce((x, i) => x + i.cantidad * i.precio, 0), 0)
            return t > 0 ? (
              <li key={p.id} className="flex justify-between text-sm num">
                <span>{p.nombre}</span><b>{fmtMoney(t)}</b>
              </li>
            ) : null
          })}
        </ul>
      </Card.Content></Card>
    </div>
  )
}
