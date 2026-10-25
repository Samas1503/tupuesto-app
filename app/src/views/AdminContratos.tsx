import { useCallback, useEffect, useState } from 'react'
import { AlertDialog, Button, Card, Chip, Input, Label, ListBox, Select, TextField } from '@heroui/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { pushRow } from '../lib/snake'
import { fmtMoney } from '../lib/format'
import {
  crearContrato, descargarPaquete, linkFirma, listarContratos,
  type Contrato, type NuevoContrato,
} from '../lib/contratos'

const COLOR_ESTADO: Record<string, 'default' | 'warning' | 'success' | 'danger'> = {
  borrador: 'default',
  enviado: 'warning',
  firmado: 'success',
  anulado: 'danger',
}

function fmtFechaC(v?: string | number): string {
  if (v == null) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** Admin → Contratos: alta de contratos de suscripción, link de firma para
 *  compartir, estado (enviado/firmado) y exportación del paquete probatorio. */
export default function AdminContratos() {
  const [contratos, setContratos] = useState<Contrato[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null) // token del link copiado
  const [exportando, setExportando] = useState<string | number | null>(null)

  // alta
  const [formOpen, setFormOpen] = useState(false)
  const [razonSocial, setRazonSocial] = useState('')
  const [cuit, setCuit] = useState('')
  const [email, setEmail] = useState('')
  const [domicilio, setDomicilio] = useState('')
  const [plan, setPlan] = useState('Fundador — $12.900/mes')
  const [precio, setPrecio] = useState('12900')
  const [tipoContrato, setTipoContrato] = useState<'prueba15'|'mensual'>('mensual')
  const [plazoMeses, setPlazoMeses] = useState('')
  const [esFundador, setEsFundador] = useState(false)
  const [crearDuenio, setCrearDuenio] = useState(false)
  const [duenioId, setDuenioId] = useState<number | null>(null)
  const [creando, setCreando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [creado, setCreado] = useState<Contrato | null>(null) // dialog con el link
  const [avisoCreado, setAvisoCreado] = useState<string | null>(null) // email falló pero el contrato existe

  // dueños locales para el vínculo opcional (duenioId)
  const duenios = (useLiveQuery(() => db.usuarios.toArray(), []) ?? [])
    .filter(u => u.rol === 'duenio' && !u.eliminado)

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

  async function copiarLink(c: Pick<Contrato, 'token' | 'link'>) {
    const link = linkFirma(c)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // fallback para navegadores sin clipboard API
      const ta = document.createElement('textarea')
      ta.value = link
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopiado(c.token ?? link)
    setTimeout(() => setCopiado(x => (x === (c.token ?? link) ? null : x)), 2000)
  }

  async function exportar(c: Contrato) {
    setExportando(c.id)
    try {
      await descargarPaquete(c)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo exportar el paquete')
    } finally {
      setExportando(null)
    }
  }

  async function crear() {
    const nuevo: NuevoContrato = {
      tipo: tipoContrato,
      ...(tipoContrato === 'mensual' && plazoMeses ? { plazoMeses: Number(plazoMeses) } : {}),
      esFundador,
      razonSocial: razonSocial.trim(),
      cuit: cuit.trim(),
      email: email.trim().toLowerCase(),
      plan: plan.trim(),
      precio: Number(precio.replace(/\D/g, '')) || 0,
      ...(domicilio.trim() ? { domicilio: domicilio.trim() } : {}),
      ...(duenioId != null ? { duenioId } : {}),
    }
    setCreando(true)
    setFormError(null)
    try {
      // cuenta de dueño nueva: rol duenio + email + nombre (sin PIN — el email le genera el acceso)
      if (crearDuenio) {
        const dup = await db.usuarios.where('email').equals(nuevo.email).first()
        if (dup) { setFormError('Ya existe un usuario con ese email'); setCreando(false); return }
        const id = await db.usuarios.add({
          rol: 'duenio',
          nombre: nuevo.razonSocial,
          email: nuevo.email,
          pinHash: '',
          debeCambiarPin: true,
          activo: true,
          eliminado: false,
        })
        void pushRow('usuarios', id)
        nuevo.duenioId = id
      }
      const { contrato, emailFallo } = await crearContrato(nuevo)
      setCreado(contrato)
      setAvisoCreado(emailFallo)
      setFormOpen(false)
      // reset del form para el próximo alta
      setRazonSocial(''); setCuit(''); setEmail(''); setDomicilio(''); setDuenioId(null)
      void cargar()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No se pudo crear el contrato')
    } finally {
      setCreando(false)
    }
  }

  const formValido =
    razonSocial.trim() !== '' &&
    cuit.trim() !== '' &&
    email.includes('@') &&
    plan.trim() !== '' &&
    Number(precio.replace(/\D/g, '')) > 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Contratos</h1>
        <p className="text-sm text-muted">
          Contratos de suscripción con firma electrónica — el link se envía por email y se firma desde el celu.
        </p>
      </div>

      {/* acciones de cabecera */}
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onPress={() => { setFormError(null); setFormOpen(true) }}>
          + Nuevo contrato
        </Button>
        <Button variant="tertiary" size="sm" onPress={() => void cargar()}>
          Actualizar
        </Button>
      </div>

      {/* lista */}
      <Card>
        <Card.Header className="px-4 pt-4 pb-0">
          <Card.Title className="text-base">Contratos emitidos</Card.Title>
          <Card.Description>Suscriptor, estado de firma y acciones probatorias.</Card.Description>
        </Card.Header>
        <Card.Content className="px-4 py-3 flex flex-col gap-3">
          {contratos == null && <p className="text-sm text-muted">Cargando…</p>}
          {error != null && (
            <p className="text-sm text-danger font-semibold">
              {error}
              <span className="block text-xs text-muted font-normal mt-1">
                La API de contratos todavía no responde — si está en desarrollo, corré `vercel dev`.
              </span>
            </p>
          )}
          {contratos != null && error == null && contratos.length === 0 && (
            <p className="text-sm text-muted">Sin contratos todavía — creá el primero con “Nuevo contrato”.</p>
          )}
          {contratos?.map(c => (
            <div key={String(c.id)} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{c.razonSocial || 'Sin razón social'}</p>
                <p className="text-xs text-muted truncate num">
                  {c.cuit && `${c.cuit} · `}{c.email || 'sin email'}
                </p>
                <p className="text-xs text-muted truncate">
                  {c.plan}{c.precio ? ` · ${fmtMoney(c.precio)}` : ''} · {fmtFechaC(c.createdAt)}
                  {c.firmadoAt ? ` · firmado ${fmtFechaC(c.firmadoAt)}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <Chip size="sm" variant="soft" color={COLOR_ESTADO[c.estado] ?? 'default'}>
                  {c.estado}
                </Chip>
                <div className="flex items-center gap-1.5">
                  {c.token && (
                    <Button size="sm" variant="tertiary" onPress={() => void copiarLink(c)}>
                      {copiado === c.token ? '¡Copiado!' : 'Copiar link'}
                    </Button>
                  )}
                  <Button
                    size="sm" variant="tertiary"
                    isDisabled={exportando === c.id}
                    onPress={() => void exportar(c)}
                  >
                    {exportando === c.id ? 'Exportando…' : 'Paquete'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </Card.Content>
      </Card>

      {/* ── alta: form ── */}
      <AlertDialog isOpen={formOpen} onOpenChange={setFormOpen}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header><AlertDialog.Heading>Nuevo contrato</AlertDialog.Heading></AlertDialog.Header>
              <AlertDialog.Body>
                <div className="flex flex-col gap-3">
                  <TextField value={razonSocial} onChange={setRazonSocial}>
                    <Label>Razón social</Label><Input placeholder="Nombre del suscriptor / empresa" />
                  </TextField>
                  <TextField value={cuit} onChange={setCuit}>
                    <Label>CUIT</Label><Input inputMode="numeric" placeholder="20-12345678-9" />
                  </TextField>
                  <TextField value={email} onChange={setEmail}>
                    <Label>Email</Label><Input type="email" placeholder="suscriptor@correo.com" />
                  </TextField>
                  <TextField value={domicilio} onChange={setDomicilio}>
                    <Label>Domicilio legal (opcional)</Label><Input placeholder="Calle 123, Ciudad" />
                  </TextField>
                  <TextField value={plan} onChange={setPlan}>
                    <Label>Plan</Label><Input placeholder="Fundador — $12.900/mes" />
                  </TextField>
                  <TextField value={precio} onChange={v => setPrecio(v.replace(/[^\d]/g, ''))}>
                    <Label>Precio mensual ($)</Label><Input inputMode="numeric" placeholder="12900" />
                  </TextField>
                  <Select
                    placeholder="Sin vincular"
                    selectedKey={duenioId != null ? String(duenioId) : null}
                    onSelectionChange={k => setDuenioId(k != null ? Number(k) : null)}
                  >
                    <Label>Cuenta dueño (opcional)</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {duenios.map(d => (
                          <ListBox.Item key={d.id} id={String(d.id)} textValue={d.nombre}>
                            {d.nombre}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <Select selectedKey={tipoContrato} onSelectionChange={k => setTipoContrato(k as 'prueba15'|'mensual')}>
                    <Label>Tipo de contrato</Label>
                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover><ListBox>
                      <ListBox.Item id="mensual" textValue="Suscripción mensual">Suscripción mensual<ListBox.ItemIndicator /></ListBox.Item>
                      <ListBox.Item id="prueba15" textValue="Prueba — 15 días gratis">Prueba — 15 días gratis<ListBox.ItemIndicator /></ListBox.Item>
                    </ListBox></Select.Popover>
                  </Select>
                  {tipoContrato === 'mensual' && (
                    <TextField value={plazoMeses} onChange={v => setPlazoMeses(v.replace(/\D/g, ''))}>
                      <Label>Duración (meses)</Label><Input inputMode="numeric" placeholder="12" />
                    </TextField>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={esFundador} onChange={e => setEsFundador(e.target.checked)} className="accent-accent h-4 w-4" />
                    Plan Fundador (precio fundador + participación en features)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={crearDuenio} onChange={e => setCrearDuenio(e.target.checked)} className="accent-accent h-4 w-4" />
                    Crear cuenta de dueño con este email (accede con PIN por correo)
                  </label>
                  {formError != null && <p className="text-xs text-danger font-semibold">{formError}</p>}
                  <p className="text-xs text-muted">
                    Se genera el contrato y se envía el link de firma al email del suscriptor.
                  </p>
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">Cancelar</Button>
                <Button variant="primary" onPress={crear} isDisabled={!formValido || creando}>
                  {creando ? 'Creando…' : 'Crear y enviar'}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* ── link listo para compartir ── */}
      <AlertDialog isOpen={creado != null} onOpenChange={o => { if (!o) setCreado(null) }}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.Header>
                <AlertDialog.Heading>Contrato enviado</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted">
                    Se creó el contrato de <b>{creado?.razonSocial}</b> y quedó en estado <b>{creado?.estado ?? 'enviado'}</b>.
                    Compartí este link para que lo firmen:
                  </p>
                  {avisoCreado != null && (
                    <p className="text-xs text-warning font-semibold">⚠ {avisoCreado} — el link se comparte a mano.</p>
                  )}
                  {creado?.token ? (
                    <p className="text-xs num break-all rounded-xl bg-surface-tertiary border border-border px-3 py-2">
                      {linkFirma(creado)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">
                      La API no devolvió el token — refrescá la lista para copiar el link.
                    </p>
                  )}
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                {creado?.token && (
                  <Button variant="tertiary" onPress={() => void copiarLink(creado)}>
                    {copiado === creado.token ? '¡Copiado!' : 'Copiar link'}
                  </Button>
                )}
                <Button slot="close" variant="primary">Listo</Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
