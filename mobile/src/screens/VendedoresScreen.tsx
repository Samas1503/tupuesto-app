/** Equipo — gestión de vendedores. Port de views/Vendedores.tsx:
 *  solicitudes pendientes (bajas / cierres) · stats por vendedor (365d) ·
 *  alta con PIN aleatorio → /api/send-pin · resetear PIN · baja lógica + restaurar ·
 *  límite del plan. */

import React, { useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { C } from '../theme'
import { Btn, Card, CardBody, CardHead, Chip, ConfirmSheet, EmptyState, FAB, Field, H1, Muted, Num, Screen, Sheet, Sub, Toggle } from '../components/ui'
import { add, update } from '../lib/store'
import { useDatos, useJornadasRango, useSolicitudesPendientes, useVentasDeJornadas } from '../lib/data'
import { totalVentas, vendidos, ventasTotal } from '../lib/arqueo'
import { fmtMoney, hoyISO, isoMenosDias } from '../lib/format'
import { pushRow } from '../lib/snake'
import { API, authHeader, sesionActual } from '../lib/auth'
import { hashPin, pinAleatorio } from '../lib/pin'
import { planDe, permiteMas } from '../lib/planes'

/** dueño de la sesión — los vendedores creados quedan vinculados a su cuenta */
const duenioSesion = () => {
  const s = sesionActual()
  return s?.rol === 'duenio' ? s.id : undefined
}

export default function VendedoresScreen() {
  const { vendedores, productos, usuarios } = useDatos()
  const solicitudes = useSolicitudesPendientes()
  const jornadas = useJornadasRango(isoMenosDias(365), hoyISO())
  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))

  const [modal, setModal] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [credencial, setCredencial] = useState<{ nombre: string; pin?: string; email?: string; enviado: boolean } | null>(null)
  const [confirmElim, setConfirmElim] = useState<{ id: number; nombre: string; solId?: number } | null>(null)

  function statsDe(vendedorId: number) {
    const js = jornadas.filter(j => j.vendedorId === vendedorId)
    const horas = js.reduce((a, j) => {
      const fin = j.cierre?.cerradaAt ?? (j.estado === 'confirmada' ? j.confirmadaAt ?? j.createdAt : Date.now())
      return a + Math.max(0, (fin - j.createdAt) / 3600e3)
    }, 0)
    const unidades = js.reduce((a, j) => {
      if (j.cierre) return a + productos.reduce((s, p) => s + vendidos(j, p.id!), 0)
      const vj = ventas.filter(v => v.jornadaId === j.id)
      return a + vj.reduce((s, v) => s + v.items.reduce((x, l) => x + l.cantidad, 0), 0)
    }, 0)
    const rendimiento = js.reduce((a, j) => {
      if (j.cierre) return a + totalVentas(j, productos)
      return a + ventasTotal(ventas.filter(v => v.jornadaId === j.id))
    }, 0)
    return { turnos: js.length, horas, unidades, rendimiento }
  }

  async function enviarPin(nombreV: string, pin: string, emailV?: string) {
    if (!emailV) { setCredencial({ nombre: nombreV, pin, enviado: false }); return }
    try {
      const r = await fetch(`${API}/api/send-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ email: emailV, nombre: nombreV, pin, appUrl: `${API}/app` }),
      })
      setCredencial(r.ok ? { nombre: nombreV, email: emailV, enviado: true } : { nombre: nombreV, pin, email: emailV, enviado: false })
    } catch {
      setCredencial({ nombre: nombreV, pin, email: emailV, enviado: false })
    }
  }

  const usuarioSesion = usuarios.find(u => u.id === sesionActual()?.id)
  const plan = planDe(usuarioSesion?.plan)
  const limiteVendedores = !permiteMas(plan, vendedores.filter(v => !v.eliminado).length, 'vendedores')

  async function agregar() {
    if (limiteVendedores) {
      Alert.alert(`Límite del plan ${plan.nombre}`, `Máximo ${plan.maxVendedores} vendedores`)
      return
    }
    const n = nombre.trim()
    if (!n) return
    const e = email.trim()
    const pin = await pinAleatorio()
    const id = add('usuarios', {
      rol: 'vendedor', nombre: n, email: e, duenioId: duenioSesion(),
      pinHash: await hashPin(pin), debeCambiarPin: true, activo: true,
    })
    void pushRow('usuarios', id)
    setNombre('')
    setEmail('')
    setModal(false)
    await enviarPin(n, pin, e)
  }

  async function resolver(solId: number, aprobar: boolean, vendedorId: number, tipo: string, jornadaId?: number) {
    if (!aprobar) {
      update('solicitudes', solId, { estado: 'rechazada', resueltaAt: Date.now() })
      void pushRow('solicitudes', solId)
      return
    }
    if (tipo === 'cierre-anticipado') {
      if (jornadaId != null) {
        update('jornadas', jornadaId, { cierreAnticipadoOk: true, estado: 'cerrada' })
        void pushRow('jornadas', jornadaId)
      }
      update('solicitudes', solId, { estado: 'aprobada', resueltaAt: Date.now() })
      void pushRow('solicitudes', solId)
      return
    }
    const v = vendedores.find(x => x.id === vendedorId)
    setConfirmElim({ id: vendedorId, nombre: v?.nombre ?? 'vendedor', solId })
  }

  function restaurar(id: number) {
    update('usuarios', id, { eliminado: false, activo: true })
    void pushRow('usuarios', id)
  }

  function confirmarEliminar() {
    if (!confirmElim) return
    update('usuarios', confirmElim.id, { eliminado: true, activo: false })
    void pushRow('usuarios', confirmElim.id)
    if (confirmElim.solId != null) {
      update('solicitudes', confirmElim.solId, { estado: 'aprobada', resueltaAt: Date.now() })
      void pushRow('solicitudes', confirmElim.solId)
    }
  }

  async function resetear(nombreV: string, id: number) {
    const pin = await pinAleatorio()
    update('usuarios', id, { pinHash: await hashPin(pin), debeCambiarPin: true })
    void pushRow('usuarios', id)
    await enviarPin(nombreV, pin, vendedores.find(x => x.id === id)?.email)
  }

  function toggleActivo(id: number, activo: boolean) {
    update('usuarios', id, { activo })
    void pushRow('usuarios', id)
  }

  return (
    <Screen>
      <View>
        <H1>Equipo</H1>
        <Sub>
          Gestionás usuarios y accesos. Los PIN no se ven — al crear o resetear se genera uno nuevo
          que compartís una sola vez, y el vendedor elige el suyo al entrar.
        </Sub>
      </View>

      {solicitudes.length > 0 && (
        <Card style={{ borderColor: '#f59e4266' }}>
          <CardHead title="Solicitudes pendientes" desc="Bajas y cierres anticipados — vos decidís." />
          <CardBody>
            {solicitudes.map(sol => {
              const target = vendedores.find(v => v.id === sol.vendedorId)
              const quien = vendedores.find(v => v.id === sol.solicitadoPor)
              const esCierre = sol.tipo === 'cierre-anticipado'
              return (
                <View key={sol.id} style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, color: C.navy }}>
                    <Text style={{ fontWeight: '700' }}>{quien?.nombre ?? 'Vendedor'}</Text>
                    {esCierre ? ' pidió cerrar su turno antes' : ` pidió eliminar a ${target?.nombre ?? '—'}`}
                    {sol.motivo ? <Text style={{ color: C.muted }}> · {sol.motivo}</Text> : null}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Btn sm flex onPress={() => void resolver(sol.id!, true, sol.vendedorId, sol.tipo, sol.jornadaId)}>
                      {esCierre ? 'Permitir cierre' : 'Eliminar'}
                    </Btn>
                    <Btn sm flex variant="tertiary" onPress={() => void resolver(sol.id!, false, sol.vendedorId, sol.tipo, sol.jornadaId)}>Rechazar</Btn>
                  </View>
                </View>
              )
            })}
          </CardBody>
        </Card>
      )}

      {vendedores.filter(v => !v.eliminado).length === 0 && (
        <Card><CardBody>
          <EmptyState titulo="Sin vendedores" descripcion="Tu equipo todavía está vacío — los vendedores que des cargan su turno y su rendición desde su celu." hint="Sumá el primero con el botón +" />
        </CardBody></Card>
      )}

      {vendedores.filter(v => !v.eliminado).map(v => {
        const st = statsDe(v.id!)
        return (
          <Card key={v.id}><CardBody style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }} numberOfLines={1}>{v.nombre}</Text>
                <Muted style={{ fontSize: 11 }} lines={1}>
                  {v.email ?? 'sin email'} · {v.debeCambiarPin ? 'debe elegir su PIN' : v.pinHash ? 'PIN configurado' : 'sin acceso'}
                </Muted>
                <Num style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {st.turnos} turnos · {st.horas.toFixed(1)}h · {st.unidades} u. vendidas · {fmtMoney(st.rendimiento)}
                </Num>
              </View>
              <Chip texto={v.activo ? 'activo' : 'inactivo'} color={v.activo ? 'success' : 'default'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Btn sm variant="tertiary" onPress={() => void resetear(v.nombre, v.id!)}>Resetear PIN</Btn>
              <Btn sm variant="danger-soft" onPress={() => setConfirmElim({ id: v.id!, nombre: v.nombre })}>Eliminar</Btn>
              <View style={{ marginLeft: 'auto' }}>
                <Toggle value={v.activo} onChange={on => toggleActivo(v.id!, on)} label={`Activo ${v.nombre}`} />
              </View>
            </View>
          </CardBody></Card>
        )
      })}

      {vendedores.some(v => v.eliminado) && (
        <Card>
          <CardHead title="Eliminados" />
          <CardBody>
            {vendedores.filter(v => v.eliminado).map(v => (
              <View key={v.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: C.muted, textDecorationLine: 'line-through' }}>{v.nombre}</Text>
                <Btn sm variant="tertiary" onPress={() => restaurar(v.id!)}>Restaurar</Btn>
              </View>
            ))}
          </CardBody>
        </Card>
      )}

      <FAB onPress={() => setModal(true)} />

      {/* alta */}
      <Sheet visible={modal} onClose={() => setModal(false)} title="Agregar usuario"
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => setModal(false)}>Cancelar</Btn>
            <Btn flex disabled={!nombre.trim() || !email.trim() || !email.includes('@')} onPress={() => void agregar()}>
              Crear y generar acceso
            </Btn>
          </>
        }>
        <Field label="Nombre" value={nombre} onChange={setNombre} placeholder="Ej: Camila" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="camila@correo.com" />
        <Muted style={{ fontSize: 11 }}>
          Rol vendedor. Se genera un PIN aleatorio que compartís al email — él elige el suyo al entrar.
        </Muted>
      </Sheet>

      {/* credencial generada — se muestra una sola vez si el email falló */}
      <Sheet visible={credencial != null} onClose={() => setCredencial(null)} title={`Acceso de ${credencial?.nombre ?? ''}`}
        footer={<Btn flex onPress={() => setCredencial(null)}>Entendido</Btn>}>
        {credencial?.enviado ? (
          <>
            <Muted style={{ fontSize: 13 }}>
              El PIN fue enviado a <Text style={{ fontWeight: '700', color: C.navy }}>{credencial.email}</Text> — el vendedor elige el suyo en el primer ingreso.
            </Muted>
            <Text style={{ fontSize: 28, textAlign: 'center' }}>✓</Text>
          </>
        ) : (
          <>
            <Muted style={{ fontSize: 13 }}>
              {credencial?.email ? <>El envío a <Text style={{ fontWeight: '700', color: C.navy }}>{credencial.email}</Text> falló — compartí este PIN manualmente</> : 'Sin email — compartí este PIN'} — se muestra una sola vez:
            </Muted>
            <Num style={{ fontSize: 30, fontWeight: '800', textAlign: 'center', letterSpacing: 6, color: C.navy }}>{credencial?.pin}</Num>
            <Muted style={{ fontSize: 11 }}>Al entrar por primera vez va a tener que elegir su propio PIN.</Muted>
          </>
        )}
      </Sheet>

      {/* confirmar baja */}
      <ConfirmSheet
        visible={confirmElim != null}
        onClose={() => setConfirmElim(null)}
        titulo={`Eliminar a ${confirmElim?.nombre ?? ''}`}
        textoOk="Eliminar"
        peligro
        onOk={confirmarEliminar}
      >
        <Muted style={{ fontSize: 13 }}>
          El vendedor pasa a Eliminados y queda fuera de login y turnos.
          Sus jornadas y ventas históricas se conservan — podés restaurarlo después.
        </Muted>
      </ConfirmSheet>
    </Screen>
  )
}
