import { useState } from 'react'
import { AlertDialog, Button, Card, Chip, Input, Label, ListBox, Select, TextField } from '@heroui/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useDatos, useSolicitudesPendientes } from '../lib/data'
import { hoyISO } from '../lib/format'
import { pushRow } from '../lib/snake'
import { hashPin } from '../lib/pin'
import type { Categoria } from '../types'

function genPin() { return String(Math.floor(1000 + Math.random() * 9000)) }

const CATEGORIAS: { id: Categoria; label: string }[] = [
  { id: 'comida', label: 'Comida' },
  { id: 'postres', label: 'Postres' },
  { id: 'ropa', label: 'Ropa' },
  { id: 'mercaderia', label: 'Mercadería' },
  { id: 'juguetes', label: 'Juguetes' },
  { id: 'otro', label: 'Otro' },
]

/** Admin del sistema — gestiona dueños, usuarios eliminados y control global */
export default function Admin() {
  const { vendedores, puestos, productos } = useDatos()
  const solicitudes = useSolicitudesPendientes()
  const usuarios = useLiveQuery(() => db.usuarios.toArray(), []) ?? []
  const duenios = usuarios.filter(u => u.rol === 'duenio')
  const jornadasHoy = useLiveQuery(() => db.jornadas.where('fecha').equals(hoyISO()).toArray(), []) ?? []
  const ventasHoy = useLiveQuery(
    () => db.ventas.filter(v => jornadasHoy.some(j => j.id === v.jornadaId)).toArray(),
    [jornadasHoy.length],
  ) ?? []

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('comida')
  const [confirmElim, setConfirmElim] = useState<{ id: number; nombre: string } | null>(null)

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
        body: JSON.stringify({ email: e, nombre: n, pin, appUrl: location.origin }),
      })
    } catch { /* sin api en dev — el PIN queda en la ficha */ }
  }

  async function eliminarDuenio() {
    if (!confirmElim) return
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
        <p className="text-sm text-muted">Control del sistema — dueños, usuarios y restauraciones.</p>
      </div>

      {/* control global */}
      <Card>
        <Card.Content className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div><p className="text-lg font-extrabold num">{duenios.filter(d => !d.eliminado).length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">dueños</p></div>
          <div><p className="text-lg font-extrabold num">{vendedores.filter(v => !v.eliminado && v.activo).length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">vendedores</p></div>
          <div><p className="text-lg font-extrabold num">{puestos.filter(p => p.activo).length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">puestos</p></div>
          <div><p className="text-lg font-extrabold num">{productos.filter(p => p.activo).length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">productos</p></div>
          <div><p className="text-lg font-extrabold num">{jornadasHoy.length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">jornadas hoy</p></div>
          <div><p className="text-lg font-extrabold num">{ventasHoy.length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">ventas hoy</p></div>
          <div><p className={`text-lg font-extrabold num ${solicitudes.length ? 'text-warning' : ''}`}>{solicitudes.length}</p><p className="text-[0.65rem] text-muted uppercase font-bold">solicitudes</p></div>
          <div><p className={`text-lg font-extrabold num ${nEliminados ? 'text-danger' : ''}`}>{nEliminados}</p><p className="text-[0.65rem] text-muted uppercase font-bold">eliminados</p></div>
        </Card.Content>
      </Card>

      {/* dueños */}
      <Card>
        <Card.Header className="px-4 pt-4 pb-0">
          <Card.Title className="text-base">Dueños</Card.Title>
          <Card.Description>Cuentas que pagan la suscripción — el admin las crea y gestiona.</Card.Description>
        </Card.Header>
        <Card.Content className="px-4 py-3 flex flex-col gap-2">
          {duenios.filter(d => !d.eliminado).map(d => (
            <div key={d.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{d.nombre}</p>
                <p className="text-xs text-muted truncate num">
                  {d.email ?? 'sin email'} · {CATEGORIAS.find(c => c.id === d.categoria)?.label ?? 'Otro'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!d.activo && <Chip size="sm" variant="soft" color="warning">inactivo</Chip>}
                <Button size="sm" variant="danger-soft" onPress={() => setConfirmElim({ id: d.id!, nombre: d.nombre })}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
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

      {/* confirmar eliminación de dueño */}
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
                <Button slot="close" variant="danger" onPress={eliminarDuenio}>Eliminar</Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
