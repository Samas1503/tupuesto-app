import { useState } from 'react'
import { AlertDialog, Button, Card, Chip, Input, Label, ListBox, Select, Switch, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import AdminMoney from './AdminMoney'
import AdminScores from './AdminScores'
import AdminContratos from './AdminContratos'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { cobrado } from '../lib/arqueo'
import { fmtFecha, fmtMoney } from '../lib/format'
import { pushRow } from '../lib/snake'
import { hashPin } from '../lib/pin'
import type { Categoria, EstadoJornada, Puesto } from '../types'

function genPin() { return String(Math.floor(1000 + Math.random() * 9000)) }

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
  abierta: 'default',
  cerrada: 'warning',
  confirmada: 'success',
}

/** los puestos espejados desde Neon traen `duenio_id` (→ duenioId) aunque el
 *  type `Puesto` no lo declare — se lee casteado, sin tocar types.ts */
type PuestoAdmin = Puesto & { duenioId?: number }

/** Admin del sistema — gestiona usuarios (ABM) y ve puestos/jornadas globales */
export default function Admin() {
  // admin ve TODO sin filtrar por duenioId — queries directas sobre Dexie
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const puestos = (useLiveQuery(() => db.puestos.orderBy('id').toArray(), []) ?? []) as PuestoAdmin[]
  const jornadas = useLiveQuery(
    async () => (await db.jornadas.toArray()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 15),
    [],
  ) ?? []
  const nJornadas = useLiveQuery(() => db.jornadas.count(), []) ?? 0

  const duenios = usuarios.filter(u => u.rol === 'duenio')
  const vendedores = usuarios.filter(u => u.rol === 'vendedor')

  const nombreDuenio = (id?: number) =>
    id == null ? 'sin dueño' : duenios.find(d => d.id === id)?.nombre ?? '—'
  const nombreVendedor = (id?: number) =>
    id == null ? 'libre' : usuarios.find(u => u.id === id)?.nombre ?? '—'
  const nombrePuesto = (id: number) => puestos.find(p => p.id === id)?.nombre ?? '—'

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('comida')
  const [confirmElim, setConfirmElim] = useState<{ id: number; nombre: string } | null>(null)
  const [resetInfo, setResetInfo] = useState<string | null>(null)
  const [seccion, setSeccion] = useState<'gestion' | 'dinero' | 'puntajes' | 'contratos'>('gestion')

  const nEliminados = usuarios.filter(u => u.eliminado && u.rol !== 'admin').length

  async function crearDuenio() {
    const n = nombre.trim()
    const e = email.trim()
    if (!n || !e.includes('@')) return
    const pin = genPin()
    const id = await db.usuarios.add({
      rol: 'duenio', nombre: n, email: e, categoria,
      pinHash: await hashPin(pin), debeCambiarPin: true, activo: true,
    })
    void pushRow('usuarios', id)
    setNombre(''); setEmail(''); setCategoria('comida')
    try {
      await fetch('/api/send-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, nombre: n, pin, appUrl: location.origin + '/app' }),
      })
    } catch { /* sin api en dev — el PIN queda en la ficha */ }
  }

  async function toggleActivo(id: number, activo: boolean) {
    await db.usuarios.update(id, { activo })
    void pushRow('usuarios', id)
  }

  /** reseteo del admin: PIN fijo 0000 + flag — el usuario elige el suyo al entrar */
  async function resetearPin(id: number, nombreU: string) {
    await db.usuarios.update(id, { pinHash: await hashPin('0000'), debeCambiarPin: true })
    void pushRow('usuarios', id)
    setResetInfo(nombreU)
  }

  async function eliminarUsuario() {
    if (!confirmElim) return
    // eliminación lógica — restaura desde la sección Eliminados
    await db.usuarios.update(confirmElim.id, { eliminado: true, activo: false })
    void pushRow('usuarios', confirmElim.id)
    setConfirmElim(null)
  }

  async function restaurar(id: number) {
    await db.usuarios.update(id, { eliminado: false, activo: true })
    void pushRow('usuarios', id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Administración</h1>
        <p className="text-sm text-muted">Control del sistema — usuarios, puestos y jornadas de todas las cuentas.</p>
      </div>

      {/* tabs del dashboard: gestión / dinero / puntajes */}
      <ToggleButtonGroup
        selectionMode="single"
        selectedKeys={new Set([seccion])}
        onSelectionChange={k => setSeccion([...k][0] as 'gestion' | 'dinero' | 'puntajes' | 'contratos')}
        aria-label="Sección"
        size="sm"
        className="self-start"
      >
        <ToggleButton id="gestion">Gestión</ToggleButton>
        <ToggleButton id="dinero">Dinero</ToggleButton>
        <ToggleButton id="puntajes">Puntajes</ToggleButton>
        <ToggleButton id="contratos">Contratos</ToggleButton>
      </ToggleButtonGroup>

      {seccion === 'dinero' && <AdminMoney />}
      {seccion === 'puntajes' && <AdminScores />}
      {seccion === 'contratos' && <AdminContratos />}

      {seccion === 'gestion' && <>
      {/* control global */}
      <Card>
        <Card.Content className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div><p className="text-lg font-extrabold num">{duenios.filter(d => !d.eliminado).length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">dueños</p></div>
          <div><p className="text-lg font-extrabold num">{vendedores.filter(v => !v.eliminado && v.activo).length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">vendedores</p></div>
          <div><p className="text-lg font-extrabold num">{puestos.filter(p => p.activo).length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">puestos</p></div>
          <div><p className="text-lg font-extrabold num">{nJornadas}</p><p className="text-[0.65rem] text-muted uppercase font-bold">jornadas</p></div>
          <div><p className={`text-lg font-extrabold num ${nEliminados ? 'text-danger' : ''}`}>{nEliminados}</p><p className="text-[0.65rem] text-muted uppercase font-bold">eliminados</p></div>
        </Card.Content>
      </Card>

      {/* ── Dueños ── */}
      <Card>
        <Card.Header className="px-4 pt-4 pb-0">
          <Card.Title className="text-base">Dueños</Card.Title>
          <Card.Description>Cuentas que pagan la suscripción — el admin las crea y gestiona.</Card.Description>
        </Card.Header>
        <Card.Content className="px-4 py-3 flex flex-col gap-3">
          {duenios.filter(d => !d.eliminado).map(d => {
            const nv = vendedores.filter(v => !v.eliminado && v.duenioId === d.id).length
            const np = puestos.filter(p => p.duenioId === d.id).length
            return (
              <div key={d.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{d.nombre}</p>
                  <p className="text-xs text-muted truncate num">{d.email ?? 'sin email'}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {/* el tema (data-tema) tiñe --accent → el chip toma el color de la categoría */}
                    <span data-tema={d.categoria ?? 'otro'} className="inline-flex">
                      <Chip size="sm" className="!bg-accent !text-accent-foreground">
                        {labelCategoria(d.categoria)}
                      </Chip>
                    </span>
                    <span className="text-[0.65rem] text-muted num">{nv} vendedores · {np} puestos</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="danger-soft" onPress={() => setConfirmElim({ id: d.id!, nombre: d.nombre })}>
                    Eliminar
                  </Button>
                  <Switch
                    isSelected={d.activo}
                    onChange={x => void toggleActivo(d.id!, x)}
                    aria-label={`Activo ${d.nombre}`}
                  />
                </div>
              </div>
            )
          })}
          {duenios.filter(d => !d.eliminado).length === 0 && (
            <p className="text-sm text-muted">Sin dueños activos — creá el primero con el botón +.</p>
          )}
        </Card.Content>
      </Card>

      {/* ── Vendedores ── */}
      <Card>
        <Card.Header className="px-4 pt-4 pb-0">
          <Card.Title className="text-base">Vendedores</Card.Title>
          <Card.Description>Todos los vendedores del sistema, agrupados por el dueño de su cuenta.</Card.Description>
        </Card.Header>
        <Card.Content className="px-4 py-3 flex flex-col gap-3">
          {vendedores.filter(v => !v.eliminado).map(v => (
            <div key={v.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{v.nombre}</p>
                <p className="text-xs text-muted truncate">
                  de {nombreDuenio(v.duenioId)}{v.email ? ` · ${v.email}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Chip size="sm" variant="soft" color={v.activo ? 'success' : 'default'}>
                  {v.activo ? 'activo' : 'inactivo'}
                </Chip>
                <Button size="sm" variant="tertiary" onPress={() => resetearPin(v.id!, v.nombre)}>
                  Resetear PIN
                </Button>
                <Button size="sm" variant="danger-soft" onPress={() => setConfirmElim({ id: v.id!, nombre: v.nombre })}>
                  Eliminar
                </Button>
                <Switch
                  isSelected={v.activo}
                  onChange={x => void toggleActivo(v.id!, x)}
                  aria-label={`Activo ${v.nombre}`}
                />
              </div>
            </div>
          ))}
          {vendedores.filter(v => !v.eliminado).length === 0 && (
            <p className="text-sm text-muted">Sin vendedores — los crea cada dueño desde Equipo.</p>
          )}
        </Card.Content>
      </Card>

      {/* ── Puestos (solo lectura) ── */}
      <Card>
        <Card.Header className="px-4 pt-4 pb-0">
          <Card.Title className="text-base">Puestos</Card.Title>
          <Card.Description>Solo lectura — los puestos los gestiona cada dueño.</Card.Description>
        </Card.Header>
        <Card.Content className="px-4 py-3 flex flex-col gap-2.5">
          {puestos.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{p.nombre}</p>
                <p className="text-xs text-muted truncate">
                  {p.ubicacion || 'sin ubicación'} · de {nombreDuenio(p.duenioId)}
                </p>
              </div>
              <Chip size="sm" variant="soft" color={p.activo ? 'success' : 'default'}>
                {p.activo ? 'activo' : 'inactivo'}
              </Chip>
            </div>
          ))}
          {puestos.length === 0 && <p className="text-sm text-muted">Sin puestos cargados.</p>}
        </Card.Content>
      </Card>

      {/* ── Jornadas (solo lectura, últimas 15) ── */}
      <Card>
        <Card.Header className="px-4 pt-4 pb-0">
          <Card.Title className="text-base">Jornadas recientes</Card.Title>
          <Card.Description>Últimas {Math.min(15, nJornadas)} de {nJornadas} — solo lectura.</Card.Description>
        </Card.Header>
        <Card.Content className="px-4 py-3 flex flex-col gap-2.5">
          {jornadas.map(j => (
            <div key={j.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {fmtFecha(j.fecha)} · {nombreVendedor(j.vendedorId)}
                </p>
                <p className="text-xs text-muted truncate num">
                  {nombrePuesto(j.puestoId)} · fondo {fmtMoney(j.fondoCaja ?? 0)} · cobrado {j.cierre ? fmtMoney(cobrado(j)) : '—'}
                </p>
              </div>
              <Chip size="sm" variant="soft" color={COLOR_ESTADO[j.estado]}>
                {j.estado}
              </Chip>
            </div>
          ))}
          {jornadas.length === 0 && <p className="text-sm text-muted">Todavía no hay jornadas.</p>}
        </Card.Content>
      </Card>

      {/* FAB alta dueño */}
      <AlertDialog>
        <Button aria-label="Nuevo dueño" className="!fixed right-4 !bottom-[calc(5.5rem+env(safe-area-inset-bottom))] !z-40 !h-14 !w-14 !min-w-0 !rounded-full !p-0 !bg-accent !text-accent-foreground !shadow-xl !shadow-accent/30 !text-3xl !font-light !leading-none hover:!scale-105 active:!scale-95">+</Button>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header><AlertDialog.Heading>Nuevo dueño</AlertDialog.Heading></AlertDialog.Header>
              <AlertDialog.Body>
                <div className="flex flex-col gap-3">
                  <TextField value={nombre} onChange={setNombre}>
                    <Label>Nombre</Label><Input placeholder="Nombre y apellido" />
                  </TextField>
                  <TextField value={email} onChange={setEmail}>
                    <Label>Email</Label><Input type="email" placeholder="duenio@correo.com" />
                  </TextField>
                  <Select
                    placeholder="Elegí la categoría"
                    selectedKey={categoria}
                    onSelectionChange={k => { if (k != null) setCategoria(k as Categoria) }}
                  >
                    <Label>Categoría</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {CATEGORIAS.map(c => (
                          <ListBox.Item key={c.id} id={c.id} textValue={c.label}>
                            {c.label}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <p className="text-xs text-muted">La categoría define el color de la app del dueño. Se genera un PIN aleatorio y se envía por email — en el primer ingreso elige el suyo.</p>
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">Cancelar</Button>
                <Button slot="close" variant="primary" onPress={crearDuenio} isDisabled={!nombre.trim() || !email.includes('@')}>
                  Crear dueño
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* eliminados — restaurables */}
      {nEliminados > 0 && (
        <Card>
          <Card.Header className="px-4 pt-3 pb-0"><Card.Title className="text-sm text-muted">Eliminados — restaurables</Card.Title></Card.Header>
          <Card.Content className="px-4 py-2 flex flex-col gap-1.5">
            {usuarios.filter(u => u.eliminado && u.rol !== 'admin').map(u => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <span className="text-muted line-through">{u.nombre} <i className="not-italic text-[0.65rem]">({u.rol === 'duenio' ? 'dueño' : 'vendedor'})</i></span>
                <Button size="sm" variant="tertiary" onPress={() => restaurar(u.id!)}>Restaurar</Button>
              </div>
            ))}
          </Card.Content>
        </Card>
      )}

      </>}

      {/* diálogos — siempre montados (se abren desde gestión) */}
      <AlertDialog isOpen={resetInfo != null} onOpenChange={() => setResetInfo(null)}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[360px]">
              <AlertDialog.Header>
                <AlertDialog.Heading>PIN de {resetInfo} reseteado</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p className="text-sm text-muted">
                  Su PIN quedó en <b className="num">0000</b> — en el próximo ingreso va a tener que elegir uno nuevo.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="primary">Entendido</Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* confirmar eliminación (dueño o vendedor) */}
      <AlertDialog isOpen={confirmElim != null} onOpenChange={o => { if (!o) setConfirmElim(null) }}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[360px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header><AlertDialog.Heading>Eliminar a {confirmElim?.nombre}</AlertDialog.Heading></AlertDialog.Header>
              <AlertDialog.Body>
                <p className="text-sm text-muted">Eliminación lógica — pasa a la lista de Eliminados y se puede restaurar. Sus datos quedan guardados.</p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">Cancelar</Button>
                <Button slot="close" variant="danger" onPress={eliminarUsuario}>Eliminar</Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
