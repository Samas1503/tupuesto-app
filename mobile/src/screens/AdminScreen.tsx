/** Administración — port mínimo funcional de views/Admin.tsx (+AdminMoney,
 *  AdminScores, AdminContratos). Tabs internas: gestión / dinero / puntajes / contratos.
 *  En contratos: listar, crear y compartir link (Share API). No portado:
 *  descarga del paquete probatorio (web usa Blob/anchor — queda getPaquete()). */

import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native'
import { C, accentDe } from '../theme'
import { Btn, Card, CardBody, CardHead, Chip, ConfirmSheet, EmptyState, FAB, Field, H1, Meter, Muted, Num, Screen, Segments, Select, Sheet, Sub, Toggle } from '../components/ui'
import { add, all, update, useStoreVersion } from '../lib/store'
import { useDatos, useJornadasRango, useVentasDeJornadas } from '../lib/data'
import { cobrado, ventasTotal } from '../lib/arqueo'
import { abiertasHoy, flujoPorDia, porDuenio, porMetodo, porPuesto } from '../lib/admin-metrics'
import { fmtFecha, fmtFechaCorta, fmtHora, fmtMoney, hoyISO, isoMenosDias } from '../lib/format'
import { PERIODO_SCORE_DIAS, PESOS, scoreTodos, type BreakdownScore } from '../lib/scoring'
import { crearContrato, linkFirma, listarContratos, type Contrato, type NuevoContrato } from '../lib/contratos'
import { pushRow } from '../lib/snake'
import { API, authHeader } from '../lib/auth'
import { hashPin, pinAleatorio } from '../lib/pin'
import type { Categoria, EstadoJornada, MetodoPago, Puesto } from '../types'

type Seccion = 'gestion' | 'dinero' | 'puntajes' | 'contratos'

const CATEGORIAS: { id: Categoria; label: string }[] = [
  { id: 'comida', label: 'Comida' },
  { id: 'postres', label: 'Postres' },
  { id: 'ropa', label: 'Ropa' },
  { id: 'mercaderia', label: 'Mercadería' },
  { id: 'juguetes', label: 'Juguetes' },
  { id: 'otro', label: 'Otro' },
]
const labelCategoria = (c?: Categoria) => CATEGORIAS.find(x => x.id === c)?.label ?? 'Otro'

const COLOR_ESTADO: Record<EstadoJornada, 'default' | 'warning' | 'success'> = {
  abierta: 'default', cerrada: 'warning', confirmada: 'success',
}

type PuestoAdmin = Puesto & { duenioId?: number }

export default function AdminScreen() {
  const [seccion, setSeccion] = useState<Seccion>('gestion')
  return (
    <Screen>
      <View>
        <H1>Administración</H1>
        <Sub>Control del sistema — usuarios, puestos y jornadas de todas las cuentas.</Sub>
      </View>
      <Segments
        opciones={[
          { id: 'gestion', label: 'Gestión' },
          { id: 'dinero', label: 'Dinero' },
          { id: 'puntajes', label: 'Puntajes' },
          { id: 'contratos', label: 'Contratos' },
        ]}
        value={seccion}
        onChange={setSeccion}
      />
      {seccion === 'gestion' && <Gestion />}
      {seccion === 'dinero' && <Dinero />}
      {seccion === 'puntajes' && <Puntajes />}
      {seccion === 'contratos' && <Contratos />}
    </Screen>
  )
}

/* ══ GESTIÓN ══ */
function Gestion() {
  useStoreVersion()
  const usuarios = all('usuarios')
  const puestos = [...all('puestos')].sort((a, b) => (a.id ?? 0) - (b.id ?? 0)) as PuestoAdmin[]
  const jornadas = [...all('jornadas')].sort((a, b) => b.createdAt - a.createdAt).slice(0, 15)
  const nJornadas = all('jornadas').length

  const duenios = usuarios.filter(u => u.rol === 'duenio')
  const vendedores = usuarios.filter(u => u.rol === 'vendedor')
  const nombreDuenio = (id?: number) => (id == null ? 'sin dueño' : duenios.find(d => d.id === id)?.nombre ?? '—')
  const nombreVendedor = (id?: number) => (id == null ? 'libre' : usuarios.find(u => u.id === id)?.nombre ?? '—')
  const nombrePuesto = (id: number) => puestos.find(p => p.id === id)?.nombre ?? '—'

  const [modal, setModal] = useState(false)
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('comida')
  const [confirmElim, setConfirmElim] = useState<{ id: number; nombre: string } | null>(null)
  const [resetInfo, setResetInfo] = useState<string | null>(null)

  const nEliminados = usuarios.filter(u => u.eliminado && u.rol !== 'admin').length

  async function crearDuenio() {
    const n = nombre.trim()
    const e = email.trim()
    if (!n || !e.includes('@')) return
    const pin = await pinAleatorio()
    const id = add('usuarios', {
      rol: 'duenio', nombre: n, email: e, categoria,
      pinHash: await hashPin(pin), debeCambiarPin: true, activo: true,
    })
    void pushRow('usuarios', id)
    setNombre(''); setEmail(''); setCategoria('comida'); setModal(false)
    try {
      await fetch(`${API}/api/send-pin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ email: e, nombre: n, pin, appUrl: `${API}/app` }),
      })
    } catch { /* el PIN queda solo en el log/email del server */ }
  }

  function toggleActivo(id: number, activo: boolean) {
    update('usuarios', id, { activo })
    void pushRow('usuarios', id)
  }
  async function resetearPin(id: number, nombreU: string) {
    update('usuarios', id, { pinHash: await hashPin('0000'), debeCambiarPin: true })
    void pushRow('usuarios', id)
    setResetInfo(nombreU)
  }
  function eliminarUsuario() {
    if (!confirmElim) return
    update('usuarios', confirmElim.id, { eliminado: true, activo: false })
    void pushRow('usuarios', confirmElim.id)
  }
  function restaurar(id: number) {
    update('usuarios', id, { eliminado: false, activo: true })
    void pushRow('usuarios', id)
  }

  return (
    <>
      {/* control global */}
      <Card><CardBody style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' }}>
        {([
          ['dueños', duenios.filter(d => !d.eliminado).length],
          ['vendedores', vendedores.filter(v => !v.eliminado && v.activo).length],
          ['puestos', puestos.filter(p => p.activo).length],
          ['jornadas', nJornadas],
          ['eliminados', nEliminados],
        ] as const).map(([k, n]) => (
          <View key={k} style={{ alignItems: 'center', minWidth: 56 }}>
            <Num style={{ fontSize: 17, fontWeight: '800', color: k === 'eliminados' && nEliminados ? C.danger : C.navy }}>{n}</Num>
            <Text style={{ fontSize: 9, color: C.muted, fontWeight: '700', textTransform: 'uppercase' }}>{k}</Text>
          </View>
        ))}
      </CardBody></Card>

      {/* dueños */}
      <Card>
        <CardHead title="Dueños" desc="Cuentas que pagan la suscripción — el admin las crea y gestiona." />
        <CardBody>
          {duenios.filter(d => !d.eliminado).length === 0 && (
            <EmptyState titulo="Sin dueños" descripcion="Todavía no hay cuentas de dueño registradas." />
          )}
          {duenios.filter(d => !d.eliminado).map(d => {
            const nv = vendedores.filter(v => !v.eliminado && v.duenioId === d.id).length
            const np = puestos.filter(p => p.duenioId === d.id).length
            return (
              <View key={d.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }} numberOfLines={1}>{d.nombre}</Text>
                    <Muted style={{ fontSize: 11 }} lines={1}>{d.email ?? 'sin email'}</Muted>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <View style={{ backgroundColor: accentDe(d.categoria), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{labelCategoria(d.categoria)}</Text>
                      </View>
                      <Num style={{ fontSize: 10, color: C.muted }}>{nv} vendedores · {np} puestos</Num>
                    </View>
                  </View>
                  <Toggle value={d.activo} onChange={x => toggleActivo(d.id!, x)} label={`Activo ${d.nombre}`} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn sm variant="danger-soft" onPress={() => setConfirmElim({ id: d.id!, nombre: d.nombre })}>Eliminar</Btn>
                </View>
              </View>
            )
          })}
        </CardBody>
      </Card>

      {/* vendedores */}
      <Card>
        <CardHead title="Vendedores" desc="Todos los vendedores del sistema, agrupados por el dueño de su cuenta." />
        <CardBody>
          {vendedores.filter(v => !v.eliminado).length === 0 && (
            <EmptyState titulo="Sin vendedores" descripcion="No hay vendedores registrados — los crea cada dueño desde Equipo." />
          )}
          {vendedores.filter(v => !v.eliminado).map(v => (
            <View key={v.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }} numberOfLines={1}>{v.nombre}</Text>
                  <Muted style={{ fontSize: 11 }} lines={1}>de {nombreDuenio(v.duenioId)}{v.email ? ` · ${v.email}` : ''}</Muted>
                </View>
                <Chip texto={v.activo ? 'activo' : 'inactivo'} color={v.activo ? 'success' : 'default'} />
                <Toggle value={v.activo} onChange={x => toggleActivo(v.id!, x)} label={`Activo ${v.nombre}`} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn sm variant="tertiary" onPress={() => void resetearPin(v.id!, v.nombre)}>Resetear PIN</Btn>
                <Btn sm variant="danger-soft" onPress={() => setConfirmElim({ id: v.id!, nombre: v.nombre })}>Eliminar</Btn>
              </View>
            </View>
          ))}
        </CardBody>
      </Card>

      {/* puestos (solo lectura) */}
      <Card>
        <CardHead title="Puestos" desc="Solo lectura — los puestos los gestiona cada dueño." />
        <CardBody>
          {puestos.length === 0 && <EmptyState titulo="Sin puestos" descripcion="No hay puntos de venta cargados en el sistema." />}
          {puestos.map(p => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }} numberOfLines={1}>{p.nombre}</Text>
                <Muted style={{ fontSize: 11 }} lines={1}>{p.ubicacion || 'sin ubicación'} · de {nombreDuenio(p.duenioId)}</Muted>
              </View>
              <Chip texto={p.activo ? 'activo' : 'inactivo'} color={p.activo ? 'success' : 'default'} />
            </View>
          ))}
        </CardBody>
      </Card>

      {/* jornadas recientes (solo lectura) */}
      <Card>
        <CardHead title="Jornadas recientes" desc={`Últimas ${Math.min(15, nJornadas)} de ${nJornadas} — solo lectura.`} />
        <CardBody>
          {jornadas.length === 0 && <EmptyState titulo="Sin jornadas" descripcion="No hay turnos registrados todavía." />}
          {jornadas.map(j => (
            <View key={j.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy, textTransform: 'capitalize' }} numberOfLines={1}>
                  {fmtFecha(j.fecha)} · {nombreVendedor(j.vendedorId)}
                </Text>
                <Num style={{ fontSize: 11, color: C.muted }} lines={1}>
                  {nombrePuesto(j.puestoId)} · fondo {fmtMoney(j.fondoCaja ?? 0)} · cobrado {j.cierre ? fmtMoney(cobrado(j)) : '—'}
                </Num>
              </View>
              <Chip texto={j.estado} color={COLOR_ESTADO[j.estado]} />
            </View>
          ))}
        </CardBody>
      </Card>

      {/* eliminados */}
      {nEliminados > 0 && (
        <Card>
          <CardHead title="Eliminados — restaurables" />
          <CardBody>
            {usuarios.filter(u => u.eliminado && u.rol !== 'admin').map(u => (
              <View key={u.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: C.muted, textDecorationLine: 'line-through' }}>
                  {u.nombre} <Text style={{ fontSize: 10, fontStyle: 'normal' }}>({u.rol === 'duenio' ? 'dueño' : 'vendedor'})</Text>
                </Text>
                <Btn sm variant="tertiary" onPress={() => restaurar(u.id!)}>Restaurar</Btn>
              </View>
            ))}
          </CardBody>
        </Card>
      )}

      <FAB onPress={() => setModal(true)} />

      {/* alta dueño */}
      <Sheet visible={modal} onClose={() => setModal(false)} title="Nuevo dueño"
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => setModal(false)}>Cancelar</Btn>
            <Btn flex disabled={!nombre.trim() || !email.includes('@')} onPress={() => void crearDuenio()}>Crear dueño</Btn>
          </>
        }>
        <Field label="Nombre" value={nombre} onChange={setNombre} placeholder="Nombre y apellido" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="duenio@correo.com" />
        <Select
          label="Categoría"
          value={categoria}
          onChange={k => setCategoria(k as Categoria)}
          opciones={CATEGORIAS.map(c => ({ id: c.id, label: c.label }))}
        />
        <Muted style={{ fontSize: 11 }}>La categoría define el color de la app del dueño. Se genera un PIN aleatorio y se envía por email — en el primer ingreso elige el suyo.</Muted>
      </Sheet>

      {/* PIN reseteado */}
      <Sheet visible={resetInfo != null} onClose={() => setResetInfo(null)} title={`PIN de ${resetInfo} reseteado`}
        footer={<Btn flex onPress={() => setResetInfo(null)}>Entendido</Btn>}>
        <Muted style={{ fontSize: 13 }}>Su PIN quedó en <Num style={{ fontWeight: '800', color: C.navy }}>0000</Num> — en el próximo ingreso va a tener que elegir uno nuevo.</Muted>
      </Sheet>

      {/* confirmar baja */}
      <ConfirmSheet
        visible={confirmElim != null}
        onClose={() => setConfirmElim(null)}
        titulo={`Eliminar a ${confirmElim?.nombre ?? ''}`}
        textoOk="Eliminar"
        peligro
        onOk={eliminarUsuario}
      >
        <Muted style={{ fontSize: 13 }}>Eliminación lógica — pasa a la lista de Eliminados y se puede restaurar. Sus datos quedan guardados.</Muted>
      </ConfirmSheet>
    </>
  )
}

/* ══ DINERO ══ */
const DIAS_RANGO = 30
const DIAS_SPARK = 14
const METODOS: { id: MetodoPago; label: string; dot: string }[] = [
  { id: 'efectivo', label: 'Efectivo', dot: C.vizCash },
  { id: 'qr', label: 'QR', dot: C.vizQr },
  { id: 'transferencia', label: 'Transf.', dot: C.blurple },
]

function Dinero() {
  const { puestos } = useDatos()
  useStoreVersion()
  const usuarios = all('usuarios')
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
    <>
      {totalMovido <= 0 && (
        <Card><CardBody><EmptyState titulo="Sin flujo de dinero" descripcion="No hay ventas registradas en el período — el dinero movido aparece cuando los vendedores empiecen a vender." /></CardBody></Card>
      )}
      <Card><CardBody>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Muted style={{ fontSize: 10, fontWeight: '800' }}>TOTAL MOVIDO · {DIAS_RANGO} DÍAS</Muted>
          <Num style={{ fontSize: 10, color: C.muted }}>{ventas.length} ventas · {jornadas.length} jornadas</Num>
        </View>
        <Num style={{ fontSize: 26, fontWeight: '800', color: C.navy }}>{fmtMoney(totalMovido)}</Num>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 70, marginTop: 8 }}>
          {flujo.map(({ fecha, total }) => (
            <View key={fecha} style={{ flex: 1, justifyContent: 'flex-end', height: '100%' }}>
              <View style={{
                height: `${total > 0 ? Math.max(6, (total / maxFlujo) * 100) : 4}%`,
                backgroundColor: total > 0 ? C.blurple : C.vizTrack,
                borderTopLeftRadius: 3, borderTopRightRadius: 3,
              }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Num style={{ fontSize: 9, color: C.muted }}>{flujo.length ? fmtFechaCorta(flujo[0].fecha) : ''}</Num>
          <Muted style={{ fontSize: 9 }}>últimos {DIAS_SPARK} días</Muted>
          <Muted style={{ fontSize: 9 }}>hoy</Muted>
        </View>
      </CardBody></Card>

      {abiertas.length > 0 && (
        <Card><CardBody>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Muted style={{ fontSize: 10, fontWeight: '800' }}>ABIERTAS AHORA</Muted>
            <Num style={{ fontSize: 10, color: C.muted }}>{fmtMoney(abiertas.reduce((a, x) => a + x.enCurso, 0))} en curso</Num>
          </View>
          {abiertas.map(({ jornada, vendedor, enCurso }) => (
            <View key={jornada.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }} numberOfLines={1}>{vendedor?.nombre ?? 'Sin vendedor'}</Text>
                <Muted style={{ fontSize: 11 }} lines={1}>
                  {puestos.find(p => p.id === jornada.puestoId)?.nombre ?? '—'} · desde {fmtHora(jornada.createdAt)}
                </Muted>
              </View>
              <Chip texto="en curso" color="success" />
              <Num style={{ fontSize: 12, fontWeight: '800', color: C.navy, width: 76, textAlign: 'right' }}>{fmtMoney(enCurso)}</Num>
            </View>
          ))}
        </CardBody></Card>
      )}

      <Card><CardBody>
        <Muted style={{ fontSize: 10, fontWeight: '800', marginBottom: 6 }}>POR MÉTODO DE PAGO · {DIAS_RANGO} DÍAS</Muted>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {METODOS.map(m => (
            <View key={m.id} style={{ flex: 1, borderRadius: 12, backgroundColor: '#635bff14', paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ height: 7, width: 7, borderRadius: 4, backgroundColor: m.dot }} />
                <Text style={{ fontSize: 9, fontWeight: '800', color: C.muted, textTransform: 'uppercase' }}>{m.label}</Text>
              </View>
              <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy, marginTop: 2 }}>{fmtMoney(metodos[m.id].total)}</Num>
              <Num style={{ fontSize: 9, color: C.muted }}>{metodos[m.id].pct.toFixed(1)}% · {metodos[m.id].cantidad} ventas</Num>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', backgroundColor: C.vizTrack, marginTop: 8 }}>
          <View style={{ width: `${metodos.efectivo.pct}%`, backgroundColor: C.vizCash }} />
          <View style={{ width: `${metodos.qr.pct}%`, backgroundColor: C.vizQr }} />
          <View style={{ width: `${metodos.transferencia.pct}%`, backgroundColor: C.blurple }} />
        </View>
      </CardBody></Card>

      <Card><CardBody>
        <Muted style={{ fontSize: 10, fontWeight: '800', marginBottom: 6 }}>POR DUEÑO · {DIAS_RANGO} DÍAS</Muted>
        {duenios.length === 0 && <EmptyState titulo="Sin dueños" descripcion="No hay cuentas de dueño registradas todavía." />}
        {duenios.map(d => (
          <View key={d.duenio.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }} numberOfLines={1}>{d.duenio.nombre}</Text>
              <Num style={{ fontSize: 11, color: C.muted }}>{d.ventas} ventas · {d.vendedores} vendedores</Num>
            </View>
            <View style={{ backgroundColor: accentDe(d.duenio.categoria), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{labelCategoria(d.duenio.categoria)}</Text>
            </View>
            <Num style={{ fontSize: 12, fontWeight: '800', color: C.navy, width: 88, textAlign: 'right' }}>{fmtMoney(d.ingresos)}</Num>
          </View>
        ))}
      </CardBody></Card>

      <Card><CardBody>
        <Muted style={{ fontSize: 10, fontWeight: '800', marginBottom: 6 }}>RANKING DE PUESTOS · {DIAS_RANGO} DÍAS</Muted>
        {ranking.length === 0 && <EmptyState titulo="Sin actividad" descripcion="No hay ventas registradas en el rango de 30 días." />}
        {ranking.map((x, i) => (
          <View key={x.puesto.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, width: 16 }}>{i + 1}º</Text>
            <Text style={{ width: 96, fontSize: 12, fontWeight: '700', color: C.navy }} numberOfLines={1}>{x.puesto.nombre}</Text>
            <Meter pct={(x.ingresos / maxPuesto) * 100} color={i === 0 && x.ingresos > 0 ? C.success : undefined} />
            <View style={{ width: 90 }}>
              <Num style={{ fontSize: 11, fontWeight: '800', color: C.navy, textAlign: 'right' }}>{fmtMoney(x.ingresos)}</Num>
              <Num style={{ fontSize: 9, color: C.muted, textAlign: 'right' }}>{x.ventas} ventas · {x.jornadas} jornadas</Num>
            </View>
          </View>
        ))}
      </CardBody></Card>
    </>
  )
}

/* ══ PUNTAJES ══ */
const banda = (total: number) =>
  total >= 80 ? C.success : total >= 60 ? C.warning : C.danger

const LINEAS_SCORE: { key: keyof Omit<BreakdownScore, 'bonus'>; label: string }[] = [
  { key: 'exactitud', label: 'Exactitud de caja' },
  { key: 'frecuencia', label: 'Frecuencia' },
  { key: 'merma', label: 'Merma / descarte' },
  { key: 'volumen', label: 'Volumen vendido' },
]

function Puntajes() {
  const { productos } = useDatos()
  useStoreVersion()
  const usuarios = all('usuarios')
  const jornadas = useJornadasRango(isoMenosDias(PERIODO_SCORE_DIAS), hoyISO())
  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))
  const solicitudes = all('solicitudes')

  const scores = scoreTodos(usuarios, { jornadas, ventas, productos, solicitudes })
  const duenioDe = (id?: number) => usuarios.find(u => u.id === id)?.nombre ?? 'sin dueño'
  const catDe = (u: (typeof scores)[number]['usuario']) =>
    u.rol === 'duenio' ? (u.categoria ?? 'otro') : (usuarios.find(d => d.id === u.duenioId)?.categoria ?? 'otro')
  const grupos = CATEGORIAS.map(c => ({ ...c, items: scores.filter(s => catDe(s.usuario) === c.id) })).filter(g => g.items.length > 0)

  return (
    <>
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <H1>Puntajes</H1>
          <Chip texto="solo admin" color="warning" />
        </View>
        <Sub>Ranking de todos los usuarios por desempeño — nadie más que vos lo ve. Últimos {PERIODO_SCORE_DIAS} días: exactitud 40 · frecuencia 25 · merma 15 · volumen 20 · bonus +10.</Sub>
      </View>
      {grupos.length === 0 && (
        <Card><CardBody><EmptyState titulo="Sin puntajes" descripcion="No hay usuarios con jornadas cerradas en el período — el scoring se genera cuando hay turnos confirmados." /></CardBody></Card>
      )}
      {grupos.map(g => (
        <View key={g.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ backgroundColor: accentDe(g.id), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{g.label}</Text>
            </View>
            <Num style={{ fontSize: 11, color: C.muted }}>{g.items.length} usuario{g.items.length !== 1 ? 's' : ''}</Num>
          </View>
          {g.items.map(({ usuario: u, total, breakdown }, i) => (
            <ScoreCard key={u.id} u={u} i={i} total={total} breakdown={breakdown} duenioDe={duenioDe} />
          ))}
        </View>
      ))}
    </>
  )
}

function ScoreCard({ u, i, total, breakdown, duenioDe }: {
  u: { id?: number; rol: string; nombre: string; categoria?: string; duenioId?: number }
  i: number
  total: number
  breakdown: BreakdownScore
  duenioDe: (id?: number) => string
}) {
  const [open, setOpen] = useState(false)
  const col = banda(total)
  return (
    <Card><CardBody style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: '#635bff22', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontWeight: '900', color: C.blurple }}>{u.nombre.trim().charAt(0).toUpperCase() || '?'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }} numberOfLines={1}>{i + 1}º · {u.nombre}</Text>
          <Muted style={{ fontSize: 11 }} lines={1}>
            {u.rol === 'duenio' ? `dueño · ${u.categoria ?? 'otro'}` : `equipo de ${duenioDe(u.duenioId)}`}
          </Muted>
        </View>
        <Chip texto={u.rol === 'duenio' ? 'Dueño' : 'Vendedor'} color={u.rol === 'duenio' ? 'accent' : 'default'} />
        <Num style={{ fontSize: 26, fontWeight: '800', color: col }}>{total}</Num>
      </View>
      <Meter pct={total} color={col} />
      <Pressable onPress={() => setOpen(o => !o)}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>Detalle del puntaje {open ? '▴' : '▾'}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: 4, paddingTop: 2 }}>
          {LINEAS_SCORE.map(({ key, label }) => {
            const pts = breakdown[key]
            const max = PESOS[key]
            return (
              <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Muted style={{ fontSize: 11 }}>{label}</Muted>
                <Num style={{ fontSize: 11, color: C.navy }}>{Math.round(pts)}/{max} · {Math.round((pts / max) * 100)}%</Num>
              </View>
            )
          })}
          {breakdown.bonus > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Muted style={{ fontSize: 11 }}>Bonus — ≥3 confirmadas sin pendientes</Muted>
              <Num style={{ fontSize: 11, fontWeight: '700', color: C.success }}>+{breakdown.bonus}</Num>
            </View>
          )}
        </View>
      )}
    </CardBody></Card>
  )
}

/* ══ CONTRATOS ══ */
const COLOR_ESTADO_C: Record<string, 'default' | 'warning' | 'success' | 'danger'> = {
  borrador: 'default', enviado: 'warning', firmado: 'success', anulado: 'danger',
}

function fmtFechaC(v?: string | number): string {
  if (v == null) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function Contratos() {
  const [contratos, setContratos] = useState<Contrato[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useStoreVersion()
  const duenios = all('usuarios').filter(u => u.rol === 'duenio' && !u.eliminado)

  const [formOpen, setFormOpen] = useState(false)
  const [razonSocial, setRazonSocial] = useState('')
  const [cuit, setCuit] = useState('')
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState('Fundador — $12.900/mes')
  const [precio, setPrecio] = useState('12900')
  const [duenioId, setDuenioId] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [creado, setCreado] = useState<Contrato | null>(null)
  const [avisoCreado, setAvisoCreado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setContratos(await listarContratos())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la lista')
      setContratos([])
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function compartirLink(c: Pick<Contrato, 'token' | 'link'>) {
    try {
      await Share.share({ message: linkFirma(c) })
    } catch { /* cancelado */ }
  }

  async function crear() {
    const nuevo: NuevoContrato = {
      tipo: 'mensual',
      razonSocial: razonSocial.trim(),
      cuit: cuit.trim(),
      email: email.trim().toLowerCase(),
      plan: plan.trim(),
      precio: Number(precio.replace(/\D/g, '')) || 0,
      ...(duenioId != null ? { duenioId: Number(duenioId) } : {}),
    }
    setCreando(true)
    setFormError(null)
    try {
      const { contrato, emailFallo } = await crearContrato(nuevo)
      setCreado(contrato)
      setAvisoCreado(emailFallo)
      setFormOpen(false)
      setRazonSocial(''); setCuit(''); setEmail(''); setDuenioId(null)
      void cargar()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No se pudo crear el contrato')
    } finally {
      setCreando(false)
    }
  }

  const formValido = razonSocial.trim() !== '' && cuit.trim() !== '' && email.includes('@') && plan.trim() !== '' && Number(precio.replace(/\D/g, '')) > 0

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn sm onPress={() => { setFormError(null); setFormOpen(true) }}>+ Nuevo contrato</Btn>
        <Btn sm variant="tertiary" onPress={() => void cargar()}>Actualizar</Btn>
      </View>

      <Card>
        <CardHead title="Contratos emitidos" desc="Suscriptor, estado de firma y link para compartir." />
        <CardBody>
          {contratos == null && <Muted style={{ fontSize: 13 }}>Cargando…</Muted>}
          {error != null && (
            <Text style={{ fontSize: 13, color: C.danger, fontWeight: '700' }}>
              {error}
              <Text style={{ fontSize: 11, color: C.muted, fontWeight: '400' }}>{'\n'}La API de contratos no respondió — verificá la conexión.</Text>
            </Text>
          )}
          {contratos != null && error == null && contratos.length === 0 && (
            <EmptyState titulo="Sin contratos" descripcion="No hay contratos emitidos todavía — creá el primero con el botón +." />
          )}
          {contratos?.map(c => (
            <View key={String(c.id)} style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }} numberOfLines={1}>{c.razonSocial || 'Sin razón social'}</Text>
                <Num style={{ fontSize: 11, color: C.muted }} lines={1}>{c.cuit && `${c.cuit} · `}{c.email || 'sin email'}</Num>
                <Muted style={{ fontSize: 11 }} lines={1}>
                  {c.plan}{c.precio ? ` · ${fmtMoney(c.precio)}` : ''} · {fmtFechaC(c.createdAt)}
                  {c.firmadoAt ? ` · firmado ${fmtFechaC(c.firmadoAt)}` : ''}
                </Muted>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Chip texto={c.estado} color={COLOR_ESTADO_C[c.estado] ?? 'default'} />
                {c.token && (
                  <Btn sm variant="tertiary" onPress={() => void compartirLink(c)}>Compartir link</Btn>
                )}
              </View>
            </View>
          ))}
        </CardBody>
      </Card>

      {/* alta */}
      <Sheet visible={formOpen} onClose={() => setFormOpen(false)} title="Nuevo contrato"
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => setFormOpen(false)}>Cancelar</Btn>
            <Btn flex disabled={!formValido || creando} onPress={() => void crear()}>{creando ? 'Creando…' : 'Crear y enviar'}</Btn>
          </>
        }>
        <Field label="Razón social" value={razonSocial} onChange={setRazonSocial} placeholder="Nombre del suscriptor / empresa" />
        <Field label="CUIT" value={cuit} onChange={setCuit} numeric placeholder="20-12345678-9" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="suscriptor@correo.com" />
        <Field label="Plan" value={plan} onChange={setPlan} placeholder="Fundador — $12.900/mes" />
        <Field label="Precio mensual ($)" value={precio} onChange={v => setPrecio(v.replace(/[^\d]/g, ''))} numeric placeholder="12900" />
        <Select
          label="Cuenta dueño (opcional)"
          placeholder="Sin vincular"
          value={duenioId}
          onChange={setDuenioId}
          opciones={duenios.map(d => ({ id: String(d.id), label: d.nombre }))}
        />
        {formError != null && <Text style={{ fontSize: 12, fontWeight: '700', color: C.danger }}>{formError}</Text>}
        <Muted style={{ fontSize: 11 }}>Se genera el contrato y se envía el link de firma al email del suscriptor.</Muted>
      </Sheet>

      {/* contrato creado → link */}
      <Sheet visible={creado != null} onClose={() => setCreado(null)} title="Contrato enviado"
        footer={
          <>
            {creado?.token ? <Btn variant="tertiary" flex onPress={() => void compartirLink(creado)}>Compartir link</Btn> : null}
            <Btn flex onPress={() => setCreado(null)}>Listo</Btn>
          </>
        }>
        <Muted style={{ fontSize: 13 }}>
          Se creó el contrato de <Text style={{ fontWeight: '700', color: C.navy }}>{creado?.razonSocial}</Text> y quedó en estado <Text style={{ fontWeight: '700', color: C.navy }}>{creado?.estado ?? 'enviado'}</Text>. Compartí este link para que lo firmen:
        </Muted>
        {avisoCreado != null && <Text style={{ fontSize: 12, color: '#92600a', fontWeight: '700' }}>⚠ {avisoCreado} — el link se comparte a mano.</Text>}
        {creado?.token ? (
          <Text selectable style={{ fontSize: 11, color: C.navy, backgroundColor: C.surfaceTertiary, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10 }}>
            {linkFirma(creado)}
          </Text>
        ) : (
          <Muted style={{ fontSize: 11 }}>La API no devolvió el token — refrescá la lista para compartir el link.</Muted>
        )}
      </Sheet>
    </>
  )
}
