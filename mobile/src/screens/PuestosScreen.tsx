/** Puestos — CRUD del dueño. Port de views/Puestos.tsx:
 *  alta (nombre+ubicación) · activo/inactivo · destino QR por puesto · límite del plan. */

import React, { useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { C } from '../theme'
import { Btn, Card, CardBody, CardHead, Chip, EmptyState, FAB, Field, H1, Muted, Num, Screen, Segments, Sheet, Sub, Toggle } from '../components/ui'
import { add, update } from '../lib/store'
import { useDatos, useJornadasDe } from '../lib/data'
import { despachoValor } from '../lib/arqueo'
import { fmtMoney, hoyISO } from '../lib/format'
import { pushRow } from '../lib/snake'
import { planDe, permiteMas } from '../lib/planes'
import { sesionActual } from '../lib/auth'
import type { EstadoJornada } from '../types'

const COLOR_ESTADO: Record<EstadoJornada, 'default' | 'warning' | 'success'> = {
  abierta: 'default',
  cerrada: 'warning',
  confirmada: 'success',
}

export default function PuestosScreen() {
  const { productos, puestos, vendedores, scope, usuarios } = useDatos()
  const jornadasHoy = useJornadasDe(hoyISO())
  const [modal, setModal] = useState(false)
  const [nombreP, setNombreP] = useState('')
  const [ubicacion, setUbicacion] = useState('')

  function setQr(puestoId: number, d: string) {
    update('puestos', puestoId, { qrDestinoDefault: d as 'negocio' | 'vendedor' })
    void pushRow('puestos', puestoId)
  }
  function setActivo(puestoId: number, activo: boolean) {
    update('puestos', puestoId, { activo })
    void pushRow('puestos', puestoId)
  }

  const usuarioSesion = usuarios.find(u => u.id === sesionActual()?.id)
  const plan = planDe(usuarioSesion?.plan)
  const limitePuestos = !permiteMas(plan, puestos.filter(p => p.activo).length, 'puestos')

  async function agregar() {
    if (limitePuestos) {
      Alert.alert(`Límite del plan ${plan.nombre}`, `Máximo ${plan.maxPuestos} puestos`)
      return
    }
    const n = nombreP.trim()
    if (!n) return
    const id = add('puestos', {
      duenioId: scope ?? undefined,
      nombre: n,
      ubicacion: ubicacion.trim(),
      qrDestinoDefault: 'negocio',
      activo: true,
    })
    void pushRow('puestos', id)
    setNombreP('')
    setUbicacion('')
    setModal(false)
  }

  return (
    <Screen>
      <View>
        <H1>Puestos</H1>
        <Sub>El destino del QR define si el cobro digital cae a tu cuenta o queda en "modo confianza".</Sub>
      </View>

      {puestos.length === 0 && (
        <Card><CardBody>
          <EmptyState titulo="Sin puestos" descripcion="Todavía no registraste ningún punto de venta — cada uno define dónde se vende y cuánta caja se espera." hint="Creá el primero con el botón +" />
        </CardBody></Card>
      )}

      {puestos.map(p => {
        const j = jornadasHoy.find(x => x.puestoId === p.id)
        const v = j ? vendedores.find(x => x.id === j.vendedorId) : undefined
        return (
          <Card key={p.id} style={p.activo ? undefined : { opacity: 0.5 }}>
            <CardHead
              title={p.nombre}
              desc={`${p.ubicacion} · ${v ? v.nombre : 'sin turno hoy'}`}
              right={<Toggle value={p.activo} onChange={x => setActivo(p.id!, x)} label={`Activo ${p.nombre}`} />}
            />
            {j && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 6 }}>
                <Chip texto={j.estado} color={COLOR_ESTADO[j.estado]} />
                <Num style={{ fontSize: 11, color: C.muted }}>despacho {fmtMoney(despachoValor(j, productos))}</Num>
              </View>
            )}
            <CardBody>
              <Muted style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.4 }}>LOS QR DE ESTE PUESTO CAEN A…</Muted>
              <Segments
                opciones={[
                  { id: 'negocio', label: 'Tu cuenta' },
                  { id: 'vendedor', label: 'Cuenta del vendedor' },
                ]}
                value={p.qrDestinoDefault}
                onChange={d => setQr(p.id!, d)}
              />
              {p.qrDestinoDefault === 'vendedor' && (
                <View style={{ backgroundColor: '#f59e4214', borderWidth: 1, borderColor: '#f59e424d', borderRadius: 12, padding: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#92600a' }}>Modo confianza</Text>
                  <Muted style={{ fontSize: 12 }}>Los cobros QR de este puesto quedan marcados como anomalía en la rendición.</Muted>
                </View>
              )}
            </CardBody>
          </Card>
        )
      })}

      <FAB onPress={() => setModal(true)} />

      <Sheet visible={modal} onClose={() => setModal(false)} title="Nuevo puesto"
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => setModal(false)}>Cancelar</Btn>
            <Btn flex disabled={!nombreP.trim()} onPress={() => void agregar()}>Crear puesto</Btn>
          </>
        }>
        <Field label="Nombre del puesto" value={nombreP} onChange={setNombreP} placeholder="Ej: Parque Rivadavia" />
        <Field label="Ubicación / zona" value={ubicacion} onChange={setUbicacion} placeholder="Ej: Caballito" />
        <Muted style={{ fontSize: 11 }}>El vendedor se asigna cada día al planificar en Despacho.</Muted>
      </Sheet>
    </Screen>
  )
}
