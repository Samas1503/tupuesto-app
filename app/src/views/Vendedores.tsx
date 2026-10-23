import { useState } from 'react'
import { AlertDialog, Button, Card, Chip, Input, Label, Switch, TextField } from '@heroui/react'
import { db } from '../db'
import { totalVentas, vendidos, ventasTotal } from '../lib/arqueo'
import { fmtMoney, hoyISO, isoMenosDias } from '../lib/format'
import { useDatos, useJornadasRango, useSolicitudesPendientes, useVentasDeJornadas } from '../lib/data'

/** PIN aleatorio de 4 dígitos — el "link de acceso" local (con backend: email + token) */
const pinAleatorio = () => String(Math.floor(1000 + Math.random() * 9000))

export default function Vendedores() {
  const { vendedores, productos } = useDatos()
  const solicitudes = useSolicitudesPendientes()
  // stats por vendedor — jornadas de los últimos 365 días + ventas registradas
  const jornadas = useJornadasRango(isoMenosDias(365), hoyISO())
  const ventas = useVentasDeJornadas(jornadas.map(j => j.id!))

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
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [credencial, setCredencial] = useState<{ nombre: string; pin?: string; email?: string; enviado: boolean } | null>(null)
  async function enviarPin(nombre: string, pin: string, email?: string) {
    // el PIN viaja por email — solo se muestra acá si el envío falla (sin api en dev local)
    if (!email) { setCredencial({ nombre, pin, enviado: false }); return }
    try {
      const r = await fetch('/api/send-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nombre, pin, appUrl: location.origin }),
      })
      setCredencial(r.ok ? { nombre, email, enviado: true } : { nombre, pin, email, enviado: false })
    } catch {
      setCredencial({ nombre, pin, email, enviado: false })
    }
  }

  async function agregar() {
    const n = nombre.trim()
    if (!n) return
    const e = email.trim()
    const pin = pinAleatorio()
    await db.vendedores.add({ nombre: n, email: e, pin, debeCambiarPin: true, activo: true })
    setNombre('')
    setEmail('')
    await enviarPin(n, pin, e) // al vendedor por email; solo se muestra si falla
  }

  async function resolver(solId: number, aprobar: boolean, vendedorId: number) {
    if (aprobar) await db.vendedores.delete(vendedorId)
    await db.solicitudes.update(solId, { estado: aprobar ? 'aprobada' : 'rechazada', resueltaAt: Date.now() })
  }

  async function eliminar(id: number) {
    await db.vendedores.delete(id)
  }

  async function resetear(nombre: string, id: number) {
    const pin = pinAleatorio()
    await db.vendedores.update(id, { pin, debeCambiarPin: true })
    await enviarPin(nombre, pin, vendedores.find(x => x.id === id)?.email)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Equipo</h1>
        <p className="text-sm text-muted">
          Gestionás usuarios y accesos. Los PIN no se ven — al crear o resetear se genera uno nuevo
          que compartís una sola vez, y el vendedor elige el suyo al entrar.
        </p>
      </div>

      {solicitudes.length > 0 && (
        <Card className="border-warning">
          <Card.Header className="px-4 pt-4 pb-0">
            <Card.Title className="text-base">Solicitudes pendientes</Card.Title>
            <Card.Description>El equipo pidió estas bajas — vos decidís.</Card.Description>
          </Card.Header>
          <Card.Content className="px-4 py-3 flex flex-col gap-2">
            {solicitudes.map(sol => {
              const target = vendedores.find(v => v.id === sol.vendedorId)
              const quien = vendedores.find(v => v.id === sol.solicitadoPor)
              return (
                <div key={sol.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <b>{quien?.nombre ?? 'Vendedor'}</b> pidió eliminar a <b>{target?.nombre ?? '—'}</b>
                    {sol.motivo ? <span className="text-muted"> · {sol.motivo}</span> : null}
                  </span>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="primary" onPress={() => resolver(sol.id!, true, sol.vendedorId)}>Eliminar</Button>
                    <Button size="sm" variant="tertiary" onPress={() => resolver(sol.id!, false, sol.vendedorId)}>Rechazar</Button>
                  </div>
                </div>
              )
            })}
          </Card.Content>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {vendedores.map(v => (
          <Card key={v.id}>
            <Card.Content className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{v.nombre}</p>
                  <p className="text-xs text-muted truncate">
                    {v.email ?? 'sin email'} · {v.debeCambiarPin ? 'debe elegir su PIN' : v.pin ? 'PIN configurado' : 'sin acceso'}
                  </p>
                  {(() => {
                    const st = statsDe(v.id!)
                    return (
                      <p className="text-[0.65rem] text-muted num mt-0.5">
                        {st.turnos} turnos · {st.horas.toFixed(1)}h · {st.unidades} u. vendidas · {fmtMoney(st.rendimiento)}
                      </p>
                    )
                  })()}
                </div>
                <Chip size="sm" variant="soft" color={v.activo ? 'success' : 'default'}>
                  {v.activo ? 'activo' : 'inactivo'}
                </Chip>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="tertiary" onPress={() => resetear(v.nombre, v.id!)}>
                  Resetear PIN
                </Button>
                <Button size="sm" variant="danger-soft" onPress={() => eliminar(v.id!)}>
                  Eliminar
                </Button>
                <Switch
                  isSelected={v.activo}
                  onChange={on => db.vendedores.update(v.id!, { activo: on })}
                  aria-label={`Activo ${v.nombre}`}
                />
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>

      {/* FAB: agregar usuario */}
      <AlertDialog>
        <Button
          aria-label="Agregar usuario"
          className="!fixed right-4 !bottom-[calc(4.5rem+env(safe-area-inset-bottom))] !z-40
            !h-14 !w-14 !min-w-0 !rounded-full !p-0 !bg-accent !text-accent-foreground
            !shadow-xl !shadow-accent/30 !text-3xl !font-light !leading-none
            hover:!scale-105 active:!scale-95"
        >
          +
        </Button>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[360px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Heading>Agregar usuario</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <div className="flex flex-col gap-3">
                  <TextField value={nombre} onChange={setNombre}>
                    <Label>Nombre</Label>
                    <Input placeholder="Ej: Camila" />
                  </TextField>
                  <TextField value={email} onChange={setEmail}>
                    <Label>Email</Label>
                    <Input type="email" placeholder="camila@correo.com" />
                  </TextField>
                  <p className="text-xs text-muted">
                    Rol vendedor. Se genera un PIN aleatorio que compartís al email — él elige el suyo al entrar.
                  </p>
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">Cancelar</Button>
                <Button slot="close" variant="primary" onPress={agregar} isDisabled={!nombre.trim() || !email.trim() || !email.includes('@')}>
                  Crear y generar acceso
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>


      {/* credencial única — equivale al "link" que luego será un email */}
      <AlertDialog isOpen={credencial != null} onOpenChange={() => setCredencial(null)}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[360px]">
              <AlertDialog.Header>
                <AlertDialog.Heading>Acceso de {credencial?.nombre}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {credencial?.enviado ? (
                  <>
                    <p className="text-sm text-muted">
                      El PIN fue enviado a <b>{credencial.email}</b> — el vendedor elige el suyo en el primer ingreso.
                    </p>
                    <p className="text-2xl text-center py-2">✓</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted">
                      {credencial?.email ? <>El envío a <b>{credencial.email}</b> falló — compartí este PIN manualmente</> : 'Sin email — compartí este PIN'} — <b>se muestra una sola vez</b>:
                    </p>
                    <p className="text-3xl font-extrabold num text-center py-2 tracking-[0.3em]">
                      {credencial?.pin}
                    </p>
                    <p className="text-xs text-muted">
                      Al entrar por primera vez va a tener que elegir su propio PIN.
                    </p>
                  </>
                )}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="primary">Entendido</Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
