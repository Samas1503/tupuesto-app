import { useState } from 'react'
import { AlertDialog, Button, Card, Chip, Input, Label, TextField } from '@heroui/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { useDatos, useSolicitudesPendientes } from '../lib/data'
import { hoyISO } from '../lib/format'

function genPin() { return String(Math.floor(1000 + Math.random() * 9000)) }

/** Admin del sistema — gestiona dueños, usuarios eliminados y control global */
export default function Admin() {
  const { vendedores, puestos, productos } = useDatos()
  const solicitudes = useSolicitudesPendientes()
  const duenios = useLiveQuery(() => db.duenios.toArray(), []) ?? []
  const jornadasHoy = useLiveQuery(() => db.jornadas.where('fecha').equals(hoyISO()).toArray(), []) ?? []
  const ventasHoy = useLiveQuery(
    () => db.ventas.filter(v => jornadasHoy.some(j => j.id === v.jornadaId)).toArray(),
    [jornadasHoy.length],
  ) ?? []

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [confirmElim, setConfirmElim] = useState<{ id: number; nombre: string } | null>(null)

  const nEliminados = vendedores.filter(v => v.eliminado).length + duenios.filter(d => d.eliminado).length

  async function crearDuenio() {
    const n = nombre.trim()
    const e = email.trim()
    if (!n || !e.includes('@')) return
    const pin = genPin()
    await db.duenios.add({ nombre: n, email: e, pin, debeCambiarPin: true, activo: true })
    setNombre(''); setEmail('')
    try {
      await fetch('/api/send-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, nombre: n, pin, appUrl: location.origin }),
      })
    } catch { /* sin api en dev — el PIN queda en la ficha */ }
  }

  async function eliminarDuenio() {
    if (!confirmElim) return
    await db.duenios.update(confirmElim.id, { eliminado: true, activo: false })
    setConfirmElim(null)
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
                <p className="text-xs text-muted truncate num">{d.email ?? 'sin email'}</p>
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
                  <p className="text-xs text-muted">Se genera un PIN aleatorio y se envía por email. En el primer ingreso elige el suyo.</p>
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
            {duenios.filter(d => d.eliminado).map(d => (
              <div key={`d${d.id}`} className="flex items-center justify-between text-sm">
                <span className="text-muted line-through">{d.nombre} <i className="not-italic text-[0.65rem]">(dueño)</i></span>
                <Button size="sm" variant="tertiary" onPress={() => db.duenios.update(d.id!, { eliminado: false, activo: true })}>Restaurar</Button>
              </div>
            ))}
            {vendedores.filter(v => v.eliminado).map(v => (
              <div key={`v${v.id}`} className="flex items-center justify-between text-sm">
                <span className="text-muted line-through">{v.nombre} <i className="not-italic text-[0.65rem]">(vendedor)</i></span>
                <Button size="sm" variant="tertiary" onPress={() => db.vendedores.update(v.id!, { eliminado: false, activo: true })}>Restaurar</Button>
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
