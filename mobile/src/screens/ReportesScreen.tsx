/** Reportes avanzados — solo plan Premium. Port de views/Reportes.tsx. */

import React from 'react'
import { Text, View } from 'react-native'
import { C } from '../theme'
import { Card, CardBody, EmptyState, H1, Num, Screen } from '../components/ui'
import { useDatos, useJornadasRango, useVentasDeJornadas } from '../lib/data'
import { planDe } from '../lib/planes'
import { fmtMoney, isoMenosDias, hoyISO } from '../lib/format'
import { sesionActual } from '../lib/auth'

export default function ReportesScreen() {
  const { productos, usuarios } = useDatos()
  const sesion = usuarios.find(u => u.id === sesionActual()?.id)
  const plan = planDe(sesion?.plan)
  const jornadas = useJornadasRango(isoMenosDias(30), hoyISO())
  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))

  if (plan.id !== 'premium' && sesion?.rol !== 'admin') {
    return (
      <Screen>
        <Card><CardBody>
          <EmptyState
            titulo="Reportes avanzados — Premium"
            descripcion={`Esta sección es exclusiva del plan Premium. Tu plan actual es ${plan.nombre} — los reportes avanzados incluyen proyecciones de venta, análisis de merma y comparativas por vendedor.`}
            hint="Contactanos para hacer el upgrade"
          />
        </CardBody></Card>
      </Screen>
    )
  }

  const diasConVenta = new Set(ventas.map(v => new Date(v.createdAt).toISOString().slice(0, 10))).size || 1
  const totalMes = ventas.reduce((a, v) => a + v.total, 0)
  const promedioDia = totalMes / Math.max(diasConVenta, 1)
  const proyeccion7d = promedioDia * 7
  const merma = jornadas.reduce((a, j) => a + (j.cierre?.merma ?? []).reduce((x, l) => x + l.cantidad, 0), 0)

  return (
    <Screen>
      <H1>Reportes avanzados</H1>
      <Card><CardBody>
        <Text style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>Proyección próximos 7 días (promedio de {diasConVenta} días con venta)</Text>
        <Num style={{ fontSize: 26, fontWeight: '800', color: C.navy }}>{fmtMoney(proyeccion7d)}</Num>
      </CardBody></Card>
      <Card><CardBody>
        <Text style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>Merma del mes (descartado)</Text>
        <Num style={{ fontSize: 26, fontWeight: '800', color: C.navy }}>{merma} u.</Num>
      </CardBody></Card>
      <Card><CardBody>
        <Text style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Ventas del mes por producto</Text>
        {productos.map(p => {
          const t = ventas.reduce((a, v) => a + v.items.filter(i => i.productoId === p.id).reduce((x, i) => x + i.cantidad * p.precio, 0), 0)
          return t > 0 ? (
            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ fontSize: 13, color: C.navy }}>{p.nombre}</Text>
              <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>{fmtMoney(t)}</Num>
            </View>
          ) : null
        })}
      </CardBody></Card>
    </Screen>
  )
}
