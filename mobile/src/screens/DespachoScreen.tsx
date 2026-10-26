/** Despacho — carga de mercadería por puesto/día. Port de views/Despacho.tsx:
 *  calendario mensual (máx: hoy) · jornadas del día · nuevo despacho · editar ·
 *  reposición en curso · comprobante. */

import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { C } from '../theme'
import { Btn, Card, CardBody, CardHead, Chip, EmptyState, FAB, H1, Muted, Num, Screen, Select, Sheet, Sub } from '../components/ui'
import { add, update } from '../lib/store'
import { useDatos, useJornadasDe } from '../lib/data'
import { fmtFecha, fmtFechaCorta, fmtMoney, hoyISO } from '../lib/format'
import { despachoValor } from '../lib/arqueo'
import { pushRow } from '../lib/snake'
import type { Jornada, Linea } from '../types'

function chipEstado(j: Jornada) {
  if (j.estado === 'abierta') return <Chip texto="Abierta" />
  if (j.estado === 'cerrada') return <Chip texto="Cerró" color="warning" />
  return <Chip texto="Confirmada" color="success" />
}

/** bloque reutilizable: elegir producto + cantidad + lista de líneas */
function LineasDespacho({
  elegibles, productos, lineas, prodSel, setProdSel, cantSel, setCantSel, onAgregar, onQuitar, titulo,
}: {
  elegibles: { id?: number; nombre: string; precio: number }[]
  productos: { id?: number; nombre: string; precio: number }[]
  lineas: Linea[]
  prodSel: string | null
  setProdSel: (v: string | null) => void
  cantSel: number
  setCantSel: (v: number) => void
  onAgregar: () => void
  onQuitar: (pid: number) => void
  titulo: string
}) {
  return (
    <View style={{ gap: 8 }}>
      <Muted style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.4 }}>{titulo}</Muted>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Select
            placeholder="Elegí un producto"
            value={prodSel}
            onChange={setProdSel}
            opciones={elegibles.map(p => ({ id: String(p.id), label: `${p.nombre} · ${fmtMoney(p.precio)}` }))}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable onPress={() => setCantSel(Math.max(1, cantSel - 1))} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: C.muted }}>−</Text>
          </Pressable>
          <Num style={{ width: 30, textAlign: 'center', fontWeight: '800', color: C.navy, fontSize: 15 }}>{cantSel}</Num>
          <Pressable onPress={() => setCantSel(cantSel + 1)} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: C.muted }}>+</Text>
          </Pressable>
        </View>
        <Btn sm onPress={onAgregar} disabled={prodSel == null || cantSel <= 0}>+</Btn>
      </View>
      {lineas.map(l => {
        const p = productos.find(x => x.id === l.productoId)
        return p ? (
          <View key={l.productoId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Num style={{ fontSize: 13, color: C.navy }}>{p.nombre} × {l.cantidad}</Num>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>{fmtMoney(l.cantidad * p.precio)}</Num>
              <Pressable onPress={() => onQuitar(l.productoId)} hitSlop={6}>
                <Text style={{ color: C.danger, fontWeight: '800', fontSize: 12 }}>✕</Text>
              </Pressable>
            </View>
          </View>
        ) : null
      })}
      {lineas.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, borderStyle: 'dashed', paddingTop: 8 }}>
          <Muted style={{ fontSize: 12 }}>Total</Muted>
          <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>
            {fmtMoney(lineas.reduce((a, l) => a + l.cantidad * (productos.find(p => p.id === l.productoId)?.precio ?? 0), 0))}
          </Num>
        </View>
      )}
    </View>
  )
}

export default function DespachoScreen() {
  const { productos, puestos, vendedores, scope } = useDatos()
  const [fecha, setFecha] = useState(hoyISO())
  const [mesVis, setMesVis] = useState(() => hoyISO().slice(0, 7))
  const [calAbierto, setCalAbierto] = useState(false)
  const [formAbierto, setFormAbierto] = useState(false)
  const [puestoId, setPuestoId] = useState<string | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [prodSel, setProdSel] = useState<string | null>(null)
  const [cantSel, setCantSel] = useState(1)
  const [comprobante, setComprobante] = useState<{ j: Jornada; esRepo: boolean } | null>(null)
  const [repoDe, setRepoDe] = useState<number | null>(null)
  const [repoLineas, setRepoLineas] = useState<Linea[]>([])
  const [repoProd, setRepoProd] = useState<string | null>(null)
  const [repoCantSel, setRepoCantSel] = useState(1)
  const [editingId, setEditingId] = useState<number | null>(null)

  const jornadasEseDia = useJornadasDe(fecha)
  const activos = productos.filter(p => p.activo && (p.stockDia ?? 0) > 0)

  const yaDespachado = (productoId: number) =>
    jornadasEseDia.reduce((a, j) => a + (j.id === editingId ? 0 : (j.despacho ?? []).filter(l => l.productoId === productoId).reduce((x, l) => x + l.cantidad, 0)), 0)
  const stockRestante = (productoId: number) =>
    (productos.find(p => p.id === productoId)?.stockDia ?? 0) - yaDespachado(productoId)

  const editando = editingId != null ? jornadasEseDia.find(j => j.id === editingId) : undefined
  const puestoSel = puestoId != null ? puestos.find(p => p.id === Number(puestoId)) : undefined
  const vendedorNombre = editando ? vendedores.find(v => v.id === editando.vendedorId)?.nombre : undefined
  const yaExiste = puestoSel
    ? jornadasEseDia.find(j => j.puestoId === puestoSel.id && j.estado === 'abierta' && j.id !== editingId)
    : undefined

  const totalUnidades = lineas.reduce((a, l) => a + l.cantidad, 0)
  const productosElegibles = activos.filter(p => !lineas.some(l => l.productoId === p.id))

  function agregarLinea() {
    if (prodSel == null || cantSel <= 0) return
    const tope = stockRestante(Number(prodSel))
    if (tope <= 0) return
    setLineas(prev => [...prev, { productoId: Number(prodSel), cantidad: Math.min(cantSel, tope) }])
    setProdSel(null)
    setCantSel(1)
  }

  function limpiar() {
    setEditingId(null); setLineas([]); setPuestoId(null); setProdSel(null); setCantSel(1)
  }

  async function crear() {
    if (!puestoSel || yaExiste || lineas.length === 0) return
    const jid = add('jornadas', {
      duenioId: scope ?? undefined,
      puestoId: puestoSel.id!,
      fecha,
      despacho: lineas,
      estado: 'abierta',
      createdAt: Date.now(),
    })
    void pushRow('jornadas', jid)
    setComprobante({
      j: { puestoId: puestoSel.id!, fecha, despacho: lineas, estado: 'abierta', createdAt: Date.now() },
      esRepo: false,
    })
    limpiar()
    setFormAbierto(false)
  }

  function editar(j: Jornada) {
    setFormAbierto(true)
    setEditingId(j.id!)
    setPuestoId(String(j.puestoId))
    setLineas([...j.despacho])
  }

  async function guardarCambios() {
    if (!editando || lineas.length === 0) return
    update('jornadas', editando.id!, { despacho: lineas })
    void pushRow('jornadas', editando.id!)
    limpiar()
    setFormAbierto(false)
  }

  async function reponer() {
    const j = jornadasEseDia.find(x => x.id === repoDe)
    if (!j || repoLineas.length === 0) return
    update('jornadas', j.id!, {
      reposiciones: [...(j.reposiciones ?? []), { items: repoLineas, createdAt: Date.now() }],
    })
    void pushRow('jornadas', j.id!)
    setComprobante({
      j: { puestoId: j.puestoId, fecha, despacho: repoLineas, estado: 'abierta', createdAt: Date.now() },
      esRepo: true,
    })
    setRepoLineas([]); setRepoProd(null); setRepoCantSel(1); setRepoDe(null)
  }

  const repoJornada = jornadasEseDia.find(j => j.id === repoDe)
  const repoElegibles = activos.filter(p => !repoLineas.some(l => l.productoId === p.id))

  return (
    <Screen>
      <View>
        <H1>Despacho</H1>
        <Sub>Cargás vos lo que sale. El vendedor solo cuenta al cerrar — nunca declara esto.</Sub>
      </View>

      {/* selector de fecha + calendario */}
      {calAbierto ? (
        <Card><CardBody>
          <MiniCal fecha={fecha} mesVis={mesVis} onMes={setMesVis} onPick={f => { setFecha(f); setCalAbierto(false) }} />
        </CardBody></Card>
      ) : (
        <Btn variant="outline" onPress={() => setCalAbierto(true)}>
          <Text style={{ color: C.navy, textTransform: 'capitalize' }}>{fmtFecha(fecha)}{fecha === hoyISO() ? ' · hoy' : ''}  <Text style={{ color: C.muted }}>cambiar ▾</Text></Text>
        </Btn>
      )}

      {/* jornadas del día */}
      {jornadasEseDia.length === 0 && (
        <Card><CardBody>
          <EmptyState titulo="Sin despachos este día" descripcion="Aún no hay turnos activos para realizar despachos en esta fecha." hint="Creá el despacho con el botón +" />
        </CardBody></Card>
      )}
      {jornadasEseDia.length > 0 && (
        <View style={{ gap: 8 }}>
          <Muted style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.4 }}>JORNADAS DEL {fmtFecha(fecha).toUpperCase()}</Muted>
          {jornadasEseDia.map(j => (
            <Card key={j.id}>
              <CardHead
                title={`${puestos.find(p => p.id === j.puestoId)?.nombre ?? '—'} · ${vendedores.find(v => v.id === j.vendedorId)?.nombre ?? 'sin asignar'}`}
                desc={fmtFechaCorta(j.fecha)}
                right={chipEstado(j)}
              />
              <CardBody style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Num style={{ fontSize: 12, color: C.muted, flex: 1 }}>
                  Fondo {j.fondoCaja != null ? fmtMoney(j.fondoCaja) : '—'} · Despacho {fmtMoney(despachoValor(j, productos))} · {j.despacho.length} productos
                </Num>
                {j.estado === 'abierta' && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Btn sm variant="tertiary" onPress={() => { setRepoDe(j.id!); setRepoLineas([]); setRepoProd(null); setRepoCantSel(1) }}>Reponer</Btn>
                    <Btn sm variant="outline" disabled={editingId === j.id} onPress={() => editar(j)}>Editar</Btn>
                  </View>
                )}
              </CardBody>
            </Card>
          ))}
        </View>
      )}

      <FAB onPress={() => setFormAbierto(true)} />

      {/* modal: nuevo / editar despacho */}
      <Sheet
        visible={formAbierto}
        onClose={() => { setFormAbierto(false); limpiar() }}
        title={editando ? 'Editar despacho' : 'Nuevo despacho'}
        footer={
          <>
            {editando != null && <Btn variant="tertiary" flex onPress={() => { limpiar(); setFormAbierto(false) }}>Cancelar</Btn>}
            <Btn flex disabled={totalUnidades === 0 || (!editando && !puestoSel) || yaExiste != null}
              onPress={() => void (editando ? guardarCambios() : crear())}>
              {editando ? 'Guardar cambios' : `Confirmar despacho · ${totalUnidades} u.`}
            </Btn>
          </>
        }>
        <Select
          label="Puesto"
          placeholder="Elegí el puesto"
          value={puestoId}
          onChange={setPuestoId}
          disabled={editando != null}
          opciones={puestos.filter(p => p.activo).map(p => ({ id: String(p.id), label: `${p.nombre} — ${p.ubicacion}` }))}
        />
        <Card>
          <CardHead
            title={`${puestoSel?.nombre ?? 'Sin puesto'} · ${vendedorNombre ?? 'sin vendedor asignado'}`}
            right={editando ? <Chip texto="Editando" color="accent" /> : yaExiste ? <Chip texto="Ya cargado" color="warning" /> : undefined}
          />
          <CardBody>
            {yaExiste ? (
              <Muted style={{ fontSize: 13 }}>
                Este puesto ya tiene un turno abierto el {fmtFecha(fecha)} (estado: {yaExiste.estado}, despacho {fmtMoney(despachoValor(yaExiste, productos))}).
              </Muted>
            ) : (
              <LineasDespacho
                titulo="PRODUCTOS A DESPACHAR"
                elegibles={productosElegibles}
                productos={productos}
                lineas={lineas}
                prodSel={prodSel}
                setProdSel={setProdSel}
                cantSel={cantSel}
                setCantSel={setCantSel}
                onAgregar={agregarLinea}
                onQuitar={pid => setLineas(prev => prev.filter(l => l.productoId !== pid))}
              />
            )}
          </CardBody>
        </Card>
      </Sheet>

      {/* modal: reposición */}
      <Sheet visible={repoDe != null} onClose={() => setRepoDe(null)} title="Reponer productos"
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => setRepoDe(null)}>Cancelar</Btn>
            <Btn flex disabled={repoLineas.length === 0} onPress={() => void reponer()}>Confirmar reposición</Btn>
          </>
        }>
        {repoJornada && (
          <>
            <Muted style={{ fontSize: 13 }}>
              {puestos.find(p => p.id === repoJornada.puestoId)?.nombre} · suma stock al turno en curso
            </Muted>
            <LineasDespacho
              titulo="PRODUCTOS A REPONER"
              elegibles={repoElegibles}
              productos={productos}
              lineas={repoLineas}
              prodSel={repoProd}
              setProdSel={setRepoProd}
              cantSel={repoCantSel}
              setCantSel={setRepoCantSel}
              onAgregar={() => {
                if (repoProd == null || repoCantSel <= 0) return
                setRepoLineas(prev => [...prev, { productoId: Number(repoProd), cantidad: repoCantSel }])
                setRepoProd(null); setRepoCantSel(1)
              }}
              onQuitar={pid => setRepoLineas(prev => prev.filter(l => l.productoId !== pid))}
            />
          </>
        )}
      </Sheet>

      {/* comprobante */}
      <Sheet visible={comprobante != null} onClose={() => setComprobante(null)}
        title={comprobante?.esRepo ? 'Comprobante de reposición' : 'Comprobante de despacho'}
        footer={<Btn flex onPress={() => setComprobante(null)}>Listo</Btn>}>
        {comprobante && (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Muted style={{ fontSize: 13 }}>Fecha</Muted>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy, textTransform: 'capitalize' }}>{fmtFecha(comprobante.j.fecha)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Muted style={{ fontSize: 13 }}>Puesto</Muted>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.navy }}>{puestos.find(p => p.id === comprobante.j.puestoId)?.nombre}</Text>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, borderStyle: 'dashed', marginVertical: 4 }} />
            {comprobante.j.despacho.map(l => {
              const p = productos.find(x => x.id === l.productoId)
              return p ? (
                <View key={l.productoId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Num style={{ fontSize: 13, color: C.navy }}>{p.nombre} × {l.cantidad}</Num>
                  <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>{fmtMoney(l.cantidad * p.precio)}</Num>
                </View>
              ) : null
            })}
            <View style={{ borderTopWidth: 1, borderTopColor: C.border, borderStyle: 'dashed', marginVertical: 4 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>Valor total</Text>
              <Num style={{ fontSize: 13, fontWeight: '800', color: C.navy }}>{fmtMoney(despachoValor(comprobante.j, productos))}</Num>
            </View>
          </View>
        )}
      </Sheet>
    </Screen>
  )
}

/* ── calendario mensual compacto — semana arranca lunes, máx: hoy ── */
function MiniCal({
  fecha, mesVis, onMes, onPick,
}: {
  fecha: string
  mesVis: string
  onMes: (m: string) => void
  onPick: (f: string) => void
}) {
  const [y, m] = mesVis.split('-').map(Number)
  const hoy = hoyISO()
  const [hy, hm] = hoy.split('-').map(Number)
  const esMesActual = y === hy && m === hm
  const primerDia = new Date(y, m - 1, 1).getDay()
  const offset = (primerDia + 6) % 7
  const dias = new Date(y, m, 0).getDate()
  const nombreMes = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  const mover = (d: number) => {
    const nm = new Date(y, m - 1 + d, 1)
    onMes(`${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => mover(-1)} hitSlop={10}><Text style={{ fontSize: 20, color: C.muted }}>‹</Text></Pressable>
        <Text style={{ fontSize: 14, fontWeight: '800', color: C.navy, textTransform: 'capitalize' }}>{nombreMes}</Text>
        <Pressable onPress={() => mover(1)} disabled={esMesActual} hitSlop={10}>
          <Text style={{ fontSize: 20, color: C.muted, opacity: esMesActual ? 0.3 : 1 }}>›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '800', color: C.muted }}>{d}</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: offset }).map((_, i) => <View key={`e${i}`} style={{ width: '14.28%', height: 32 }} />)}
        {Array.from({ length: dias }).map((_, i) => {
          const d = i + 1
          const iso = `${mesVis}-${String(d).padStart(2, '0')}`
          const futuro = iso > hoy
          const sel = iso === fecha
          const esHoy = iso === hoy
          return (
            <Pressable
              key={d}
              disabled={futuro}
              onPress={() => onPick(iso)}
              style={{
                width: '14.28%', height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                backgroundColor: sel ? C.blurple : 'transparent',
                borderWidth: esHoy && !sel ? 1 : 0, borderColor: C.blurple,
              }}
            >
              <Num style={{
                fontSize: 13,
                fontWeight: sel || esHoy ? '800' : '500',
                color: sel ? '#fff' : futuro ? `${C.muted}40` : esHoy ? C.blurple : C.navy,
              }}>{d}</Num>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
