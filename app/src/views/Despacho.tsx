import { useState } from 'react'
import EmptyState from '../components/EmptyState'
import { AlertDialog, Button, Card, Chip, Label, ListBox, NumberField, Select } from '@heroui/react'
import { db } from '../db'
import { useDatos, useJornadasDe } from '../lib/data'
import { fmtFecha, fmtFechaCorta, fmtMoney, hoyISO } from '../lib/format'
import { despachoValor } from '../lib/arqueo'
import type { Jornada, Linea } from '../types'

function chipEstado(j: Jornada) {
  if (j.estado === 'abierta') return <Chip color="default" variant="soft" size="sm">Abierta</Chip>
  if (j.estado === 'cerrada') return <Chip color="warning" variant="soft" size="sm">Cerró</Chip>
  return <Chip color="success" variant="soft" size="sm">Confirmada</Chip>
}

export default function Despacho() {
  const { productos, puestos, vendedores } = useDatos()
  const [fecha, setFecha] = useState(hoyISO())
  const [mesVis, setMesVis] = useState(() => hoyISO().slice(0, 7)) // YYYY-MM
  const [calAbierto, setCalAbierto] = useState(false)
  const [puestoId, setPuestoId] = useState<number | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [prodSel, setProdSel] = useState<number | null>(null)
  const [cantSel, setCantSel] = useState(1)
  const [comprobante, setComprobante] = useState<{ j: Jornada; esRepo: boolean } | null>(null)
  const [repoDe, setRepoDe] = useState<number | null>(null)
  const [formAbierto, setFormAbierto] = useState(false)
  const [repoLineas, setRepoLineas] = useState<Linea[]>([])
  const [repoProd, setRepoProd] = useState<number | null>(null)
  const [repoCantSel, setRepoCantSel] = useState(1)
  const [editingId, setEditingId] = useState<number | null>(null)

  const jornadasEseDia = useJornadasDe(fecha)
  const activos = productos.filter(p => p.activo)
  const editando = editingId != null ? jornadasEseDia.find(j => j.id === editingId) : undefined
  const puestoSel = puestoId != null ? puestos.find(p => p.id === puestoId) : undefined
  // al editar, el vendedor del turno puede existir o no: nombre de respaldo
  const vendedorNombre = editando ? vendedores.find(v => v.id === editando.vendedorId)?.nombre : undefined
  // la jornada en edición no cuenta como "ya cargada": es la misma, no un duplicado
  const yaExiste = puestoSel
    ? jornadasEseDia.find(j => j.puestoId === puestoSel.id && j.estado === 'abierta' && j.id !== editingId)
    : undefined

  const totalUnidades = lineas.reduce((a, l) => a + l.cantidad, 0)
  const lineasDespacho = () => lineas
  const productosElegibles = activos.filter(p => !lineas.some(l => l.productoId === p.id))

  function agregarLinea() {
    if (prodSel == null || cantSel <= 0) return
    setLineas(prev => [...prev, { productoId: prodSel, cantidad: cantSel }])
    setProdSel(null)
    setCantSel(1)
  }

  function quitarLinea(id: number) {
    setLineas(prev => prev.filter(l => l.productoId !== id))
  }

  async function crear() {
    if (!puestoSel || yaExiste) return
    const despacho = lineasDespacho()
    if (despacho.length === 0) return
    await db.jornadas.add({
      puestoId: puestoSel.id!,
      fecha,
      despacho,
      estado: 'abierta',
      createdAt: Date.now(),
    })
    setLineas([])
    setFormAbierto(false)
    setComprobante({
      j: { puestoId: puestoSel.id!, fecha, despacho, estado: 'abierta', createdAt: Date.now() },
      esRepo: false,
    })
  }

  function editar(j: Jornada) {
    setFormAbierto(true)
    setEditingId(j.id!)
    setPuestoId(j.puestoId)
    setLineas([...j.despacho])
  }

  function cancelarEdicion() {
    setEditingId(null)
    setLineas([])
    setPuestoId(null)
  }

  async function guardarCambios() {
    if (!editando) return
    const despacho = lineasDespacho()
    if (despacho.length === 0) return
    await db.jornadas.update(editando.id!, { despacho })
    setEditingId(null)
    setLineas([])
    setFormAbierto(false)
  }

  async function reponer() {
    const j = jornadasEseDia.find(x => x.id === repoDe)
    if (!j || repoLineas.length === 0) return
    await db.jornadas.update(j.id!, {
      reposiciones: [...(j.reposiciones ?? []), { items: repoLineas, createdAt: Date.now() }],
    })
    setComprobante({
      j: { puestoId: j.puestoId, fecha, despacho: repoLineas, estado: 'abierta', createdAt: Date.now() },
      esRepo: true,
    })
    setRepoLineas([]); setRepoProd(null); setRepoCantSel(1); setRepoDe(null)
  }

  const repoJornada = jornadasEseDia.find(j => j.id === repoDe)
  const repoElegibles = activos.filter(p => !repoLineas.some(l => l.productoId === p.id))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Despacho</h1>
        <p className="text-sm text-muted">
          Cargás vos lo que sale. El vendedor solo cuenta al cerrar — nunca declara esto.
        </p>
      </div>

      {/* fecha: botón colapsado ↔ calendario desplegado (máx: hoy) */}
      {calAbierto ? (
        <Card>
          <Card.Content className="px-4 py-3">
            <MiniCal fecha={fecha} mesVis={mesVis} onMes={setMesVis} onPick={f => { setFecha(f); setCalAbierto(false) }} />
          </Card.Content>
        </Card>
      ) : (
        <Button
          variant="outline"
          onPress={() => setCalAbierto(true)}
          className="w-full justify-between"
        >
          <span className="capitalize">{fmtFecha(fecha)}{fecha === hoyISO() ? ' · hoy' : ''}</span>
          <span className="text-muted">cambiar ▾</span>
        </Button>
      )}



      {/* FAB: nueva jornada — el form va en modal */}
      <AlertDialog isOpen={formAbierto} onOpenChange={o => { setFormAbierto(o); if (!o) cancelarEdicion() }}>
        <Button
          aria-label="Nueva jornada"
          className="!fixed right-4 !bottom-[calc(5.5rem+env(safe-area-inset-bottom))] !z-40
            !h-14 !w-14 !min-w-0 !rounded-full !p-0 !bg-accent !text-accent-foreground
            !shadow-xl !shadow-accent/30 !text-3xl !font-light !leading-none
            hover:!scale-105 active:!scale-95"
        >
          +
        </Button>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px] max-h-[85vh] overflow-y-auto">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Heading>{editando ? 'Editar despacho' : 'Nuevo despacho'}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <div className="flex flex-col gap-4">
      <Select
        placeholder="Elegí el puesto"
        selectedKey={puestoId != null ? String(puestoId) : null}
        isDisabled={editando != null}
        onSelectionChange={k => setPuestoId(k != null ? Number(k) : null)}
      >
        <Label>Puesto</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {puestos
              .filter(p => p.activo)
              .map(p => (
                <ListBox.Item key={p.id} id={String(p.id)} textValue={p.nombre}>
                  {p.nombre} — {p.ubicacion}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
          </ListBox>
        </Select.Popover>
      </Select>


      

        <Card>
          <Card.Header className="px-4 pt-4 pb-0">
            <div className="flex justify-between items-center w-full">
              <Card.Title className="text-base">
                {puestoSel?.nombre} · {vendedorNombre ?? 'sin vendedor asignado'}
              </Card.Title>
              {editando ? (
                <Chip color="accent" variant="soft">Editando</Chip>
              ) : (
                yaExiste && <Chip color="warning" variant="soft">Ya cargado</Chip>
              )}
            </div>
          </Card.Header>
          <Card.Content className="p-4 flex flex-col gap-3">
            {yaExiste ? (
              <p className="text-sm text-muted">
                Este puesto ya tiene un turno abierto el {fmtFecha(fecha)} (estado: {yaExiste.estado},
                despacho {fmtMoney(despachoValor(yaExiste, productos))}).
              </p>
            ) : (
              <>
                

                <p className="text-xs font-bold uppercase tracking-wide text-muted mt-2">
                  Productos a despachar
                </p>
                <div className="flex gap-2 items-end flex-wrap">
                  <Select
                    className="flex-1"
                    placeholder="Elegí un producto"
                    selectedKey={prodSel != null ? String(prodSel) : null}
                    onSelectionChange={k => setProdSel(k != null ? Number(k) : null)}
                  >
                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {productosElegibles.map(p => (
                          <ListBox.Item key={p.id} id={String(p.id)} textValue={p.nombre}>
                            {p.nombre} · {fmtMoney(p.precio)}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <NumberField className="w-36 shrink-0" value={cantSel} onChange={v => setCantSel(Math.max(1, v ?? 1))} minValue={1} aria-label="Cantidad">
                    <NumberField.Group>
                      <NumberField.DecrementButton />
                      <NumberField.Input />
                      <NumberField.IncrementButton />
                    </NumberField.Group>
                  </NumberField>
                  <Button variant="primary" onPress={agregarLinea} isDisabled={prodSel == null || cantSel <= 0}>
                    +
                  </Button>
                </div>
                {lineas.map(l => {
                  const p = productos.find(x => x.id === l.productoId)
                  return p ? (
                    <div key={l.productoId} className="flex justify-between items-center text-sm num">
                      <span>{p.nombre} × {l.cantidad}</span>
                      <span className="flex items-center gap-2">
                        <b>{fmtMoney(l.cantidad * p.precio)}</b>
                        <button onClick={() => quitarLinea(l.productoId)} className="text-danger text-xs font-bold" aria-label={`Quitar ${p.nombre}`}>✕</button>
                      </span>
                    </div>
                  ) : null
                })}
                {lineas.length > 0 && (
                  <div className="flex justify-between border-t border-dashed border-border pt-2 text-sm num">
                    <span className="text-muted">Total despacho</span>
                    <b>{fmtMoney(lineas.reduce((a, l) => a + l.cantidad * (productos.find(p => p.id === l.productoId)?.precio ?? 0), 0))}</b>
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  {editando && (
                    <Button variant="tertiary" onPress={cancelarEdicion}>
                      Cancelar
                    </Button>
                  )}
                  <Button
                    className="flex-1"
                    onPress={editando ? guardarCambios : crear}
                    isDisabled={totalUnidades === 0 || (!editando && !puestoSel)}
                  >
                    {editando ? 'Guardar cambios' : `Confirmar despacho · ${totalUnidades} u.`}
                  </Button>
                </div>
              </>
            )}
          </Card.Content>
        </Card>
                </div>
              </AlertDialog.Body>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* modal reposición — mismo formato que el despacho */}
      <AlertDialog isOpen={repoDe != null} onOpenChange={o => { if (!o) setRepoDe(null) }}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[420px] max-h-[85vh] overflow-y-auto">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Heading>Reponer productos</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {repoJornada && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted">
                      {puestos.find(p => p.id === repoJornada.puestoId)?.nombre} · suma stock al turno en curso
                    </p>
                    <div className="flex gap-2 items-end flex-wrap">
                      <Select
                        className="flex-1"
                        placeholder="Elegí un producto"
                        selectedKey={repoProd != null ? String(repoProd) : null}
                        onSelectionChange={k => setRepoProd(k != null ? Number(k) : null)}
                      >
                        <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {repoElegibles.map(p => (
                              <ListBox.Item key={p.id} id={String(p.id)} textValue={p.nombre}>
                                {p.nombre} · {fmtMoney(p.precio)}
                                <ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      <NumberField className="w-36 shrink-0" value={repoCantSel} onChange={v => setRepoCantSel(Math.max(1, v ?? 1))} minValue={1} aria-label="Cantidad">
                        <NumberField.Group>
                          <NumberField.DecrementButton />
                          <NumberField.Input />
                          <NumberField.IncrementButton />
                        </NumberField.Group>
                      </NumberField>
                      <Button variant="primary" onPress={() => {
                        if (repoProd == null || repoCantSel <= 0) return
                        setRepoLineas(prev => [...prev, { productoId: repoProd, cantidad: repoCantSel }])
                        setRepoProd(null); setRepoCantSel(1)
                      }} isDisabled={repoProd == null || repoCantSel <= 0}>
                        +
                      </Button>
                    </div>
                    {repoLineas.map(l => {
                      const p = productos.find(x => x.id === l.productoId)
                      return p ? (
                        <div key={l.productoId} className="flex justify-between items-center text-sm num">
                          <span>{p.nombre} × {l.cantidad}</span>
                          <span className="flex items-center gap-2">
                            <b>{fmtMoney(l.cantidad * p.precio)}</b>
                            <button onClick={() => setRepoLineas(prev => prev.filter(x => x.productoId !== l.productoId))} className="text-danger text-xs font-bold" aria-label={`Quitar ${p.nombre}`}>✕</button>
                          </span>
                        </div>
                      ) : null
                    })}
                    {repoLineas.length > 0 && (
                      <div className="flex justify-between border-t border-dashed border-border pt-2 text-sm num">
                        <span className="text-muted">Total reposición</span>
                        <b>{fmtMoney(repoLineas.reduce((a, l) => a + l.cantidad * (productos.find(p => p.id === l.productoId)?.precio ?? 0), 0))}</b>
                      </div>
                    )}
                  </div>
                )}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" onPress={() => setRepoDe(null)}>Cancelar</Button>
                <Button variant="primary" onPress={reponer} isDisabled={repoLineas.length === 0}>
                  Confirmar reposición
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* comprobante del despacho */}
      <AlertDialog isOpen={comprobante != null} onOpenChange={() => setComprobante(null)}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[360px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Heading>{comprobante?.esRepo ? 'Comprobante de reposición' : 'Comprobante de despacho'}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {comprobante && (
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted">Fecha</span><b>{fmtFecha(comprobante.j.fecha)}</b></div>
                    <div className="flex justify-between"><span className="text-muted">Puesto</span><b>{puestos.find(p => p.id === comprobante.j.puestoId)?.nombre}</b></div>
                    <div className="border-t border-dashed border-border my-1" />
                    {comprobante.j.despacho.map(l => {
                      const p = productos.find(x => x.id === l.productoId)
                      return p ? (
                        <div key={l.productoId} className="flex justify-between num">
                          <span>{p.nombre} × {l.cantidad}</span>
                          <b>{fmtMoney(l.cantidad * p.precio)}</b>
                        </div>
                      ) : null
                    })}
                    <div className="border-t border-dashed border-border my-1" />
                    <div className="flex justify-between font-bold num">
                      <span>Valor total</span>
                      <span>{fmtMoney(despachoValor(comprobante.j, productos))}</span>
                    </div>
                  </div>
                )}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="primary" className="w-full">Listo</Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* jornadas existentes ese día */}
      {jornadasEseDia.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
            Jornadas del {fmtFecha(fecha)}
          </p>
          {jornadasEseDia.length === 0 && (
            <Card>
              <Card.Content className="p-2">
                <EmptyState
                  titulo="Sin turnos activos"
                  descripcion="Aún no hay turnos activos para realizar despachos en esta fecha."
                  hint="Creá el despacho con el botón +"
                />
              </Card.Content>
            </Card>
          )}
          <div className="flex flex-col gap-2">
            {jornadasEseDia.map(j => (
              <Card key={j.id}>
                <Card.Header className="px-4 pt-3 pb-0">
                  <div className="flex justify-between items-start w-full">
                    <div>
                      <Card.Title className="text-sm">
                        {puestos.find(p => p.id === j.puestoId)?.nombre} ·{' '}
                        {vendedores.find(v => v.id === j.vendedorId)?.nombre ?? 'sin asignar'}
                      </Card.Title>
                      <Card.Description>{fmtFechaCorta(j.fecha)}</Card.Description>
                    </div>
                    {chipEstado(j)}
                  </div>
                </Card.Header>
                <Card.Content className="px-4 pb-3 pt-1.5 flex justify-between items-center gap-2">
                  <span className="text-sm text-muted num">
                    Fondo {j.fondoCaja != null ? fmtMoney(j.fondoCaja) : '—'} · Despacho {fmtMoney(despachoValor(j, productos))} ·{' '}
                    {j.despacho.length} productos
                  </span>
                  {j.estado === 'abierta' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="tertiary"
                        onPress={() => { setRepoDe(j.id!); setRepoLineas([]); setRepoProd(null); setRepoCantSel(1) }}
                      >
                        Reponer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={editingId === j.id}
                        onPress={() => editar(j)}
                      >
                        Editar
                      </Button>
                    </div>
                  )}
                </Card.Content>

              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── calendario mensual compacto ─────────────────────────── */
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
  const primerDia = new Date(y, m - 1, 1).getDay() // 0=dom
  const offset = (primerDia + 6) % 7 // semana arranca lunes
  const dias = new Date(y, m, 0).getDate()
  const nombreMes = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  const mover = (d: number) => {
    const nm = new Date(y, m - 1 + d, 1)
    onMes(`${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <button onClick={() => mover(-1)} aria-label="Mes anterior" className="text-muted px-2 text-lg">‹</button>
        <span className="text-sm font-bold capitalize">{nombreMes}</span>
        <button
          onClick={() => mover(1)}
          disabled={esMesActual}
          aria-label="Mes siguiente"
          className={`px-2 text-lg ${esMesActual ? 'opacity-30' : 'text-muted'}`}
        >›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-bold text-muted uppercase">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: offset }).map((_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: dias }).map((_, i) => {
          const d = i + 1
          const iso = `${mesVis}-${String(d).padStart(2, '0')}`
          const futuro = iso > hoy
          const sel = iso === fecha
          const esHoy = iso === hoy
          return (
            <button
              key={d}
              disabled={futuro}
              onClick={() => onPick(iso)}
              className={`h-8 rounded-lg text-sm num transition-colors
                ${sel ? 'bg-accent text-accent-foreground font-bold'
                  : futuro ? 'text-muted/30'
                  : esHoy ? 'ring-1 ring-accent text-accent font-semibold'
                  : 'hover:bg-surface-secondary'}`}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}
