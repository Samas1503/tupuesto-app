import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Input, Label, ListBox, NumberField, Select, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { db } from '../db'
import { useDatos, useJornadaVendedor } from '../lib/data'
import { fmtFecha, fmtHora, fmtMoney, hoyISO } from '../lib/format'
import type { Cierre, DestinoQR, Jornada, Linea } from '../types'

/** conteo físico local del cierre */
interface Conteo {
  remanente: number
  merma: number
}

export default function MiDia() {
  const { productos, puestos, vendedores } = useDatos()
  const [vendedorId, setVendedorId] = useState<number | null>(() => {
    const v = localStorage.getItem('tp-vendedor')
    return v ? Number(v) : null
  })
  const hoy = hoyISO()
  const jornada = useJornadaVendedor(vendedorId, hoy)
  const puesto = jornada ? puestos.find(p => p.id === jornada.puestoId) : undefined

  // estado del formulario de cierre
  const [conteo, setConteo] = useState<Record<number, Conteo>>({})
  const [efectivo, setEfectivo] = useState(0)
  const [qr, setQr] = useState(0)
  const [qrDestino, setQrDestino] = useState<DestinoQR>('negocio')
  const [nota, setNota] = useState('')
  const [listo, setListo] = useState(false)

  // cuando aparece la jornada, inicializar el destino QR con el default del puesto
  useEffect(() => {
    if (puesto) setQrDestino(puesto.qrDestinoDefault)
    setListo(false)
  }, [jornada?.id])

  function elegirVendedor(k: unknown) {
    const id = k != null ? Number(k) : null
    setVendedorId(id)
    if (id != null) localStorage.setItem('tp-vendedor', String(id))
  }

  const qty = (lineas: Linea[], id: number) => lineas.find(l => l.productoId === id)?.cantidad ?? 0

  // vista previa del arqueo en vivo (mismo cálculo que ve el dueño)
  const preview = useMemo(() => {
    if (!jornada) return null
    const fake: Jornada = {
      ...jornada,
      cierre: {
        remanente: Object.entries(conteo).map(([id, c]) => ({ productoId: Number(id), cantidad: c.remanente })),
        merma: Object.entries(conteo).map(([id, c]) => ({ productoId: Number(id), cantidad: c.merma })),
        efectivoContado: efectivo,
        qrTotal: qr,
        qrDestino,
        cerradaAt: Date.now(),
      },
    }
    const ventas = productos.reduce((acc, p) => {
      const vendidas = Math.max(
        0,
        qty(fake.despacho, p.id!) - qty(fake.cierre!.remanente, p.id!) - qty(fake.cierre!.merma, p.id!),
      )
      return acc + vendidas * p.precio
    }, 0)
    const esp = jornada.fondoCaja + ventas
    return { ventas, esp, dif: efectivo + qr - esp }
  }, [jornada, conteo, efectivo, qr, qrDestino, productos])

  async function cerrarDia() {
    if (!jornada || !preview) return
    const cierre: Cierre = {
      remanente: productos
        .map(p => ({ productoId: p.id!, cantidad: conteo[p.id!]?.remanente ?? 0 }))
        .filter(l => l.cantidad > 0),
      merma: productos
        .map(p => ({ productoId: p.id!, cantidad: conteo[p.id!]?.merma ?? 0 }))
        .filter(l => l.cantidad > 0),
      efectivoContado: efectivo,
      qrTotal: qr,
      qrDestino,
      nota: nota.trim() || undefined,
      cerradaAt: Date.now(),
    }
    await db.jornadas.update(jornada.id!, { cierre, estado: 'cerrada' })
    setListo(true)
  }

  function setC(id: number, campo: keyof Conteo, v: number) {
    setConteo(prev => {
      const c = prev[id] ?? { remanente: 0, merma: 0 }
      return { ...prev, [id]: { ...c, [campo]: v } }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Mi día</h1>
        <p className="text-sm text-muted capitalize">{fmtFecha(hoy)}</p>
      </div>

      {/* selector de vendedor — solo para la demo (en real es tu celular) */}
      <Select
        placeholder="¿Quién sos?"
        selectedKey={vendedorId != null ? String(vendedorId) : null}
        onSelectionChange={elegirVendedor}
      >
        <Label>Vendedor (demo)</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {vendedores.map(v => (
              <ListBox.Item key={v.id} id={String(v.id)} textValue={v.nombre}>
                {v.nombre} — {puestos.find(p => p.id === v.puestoId)?.nombre}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {vendedorId != null && !jornada && (
        <Alert>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Hoy no tenés jornada</Alert.Title>
            <Alert.Description>
              El dueño todavía no cargó tu despacho del día.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {jornada && puesto && (
        <>
          {/* lo que te cargaron — solo lectura */}
          <Card>
            <Card.Header className="px-4 pt-4 pb-0">
              <Card.Title className="text-base">{puesto.nombre}</Card.Title>
              <Card.Description>Fondo de caja: <b className="num">{fmtMoney(jornada.fondoCaja)}</b></Card.Description>
            </Card.Header>
            <Card.Content className="px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Te llevaron</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {jornada.despacho.map(l => {
                  const p = productos.find(x => x.id === l.productoId)
                  return p ? (
                    <div key={l.productoId} className="flex justify-between num">
                      <span>{p.nombre}</span>
                      <b>{l.cantidad}</b>
                    </div>
                  ) : null
                })}
              </div>
            </Card.Content>
          </Card>

          {jornada.estado === 'abierta' && !listo && (
            /* ── CIERRE: contar lo físico, no declarar ventas ── */
            <Card>
              <Card.Header className="px-4 pt-4 pb-0">
                <Card.Title className="text-base">Cerrar el día</Card.Title>
                <Card.Description>Contá lo que quedó. No hace falta anotar cada venta.</Card.Description>
              </Card.Header>
              <Card.Content className="px-4 py-3 flex flex-col gap-4">
                {jornada.despacho.map(l => {
                  const p = productos.find(x => x.id === l.productoId)
                  if (!p) return null
                  const c = conteo[l.productoId] ?? { remanente: 0, merma: 0 }
                  const vendidas = Math.max(0, l.cantidad - c.remanente - c.merma)
                  return (
                    <div key={l.productoId} className="border-b border-dashed border-border pb-3">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="font-semibold text-sm">{p.nombre}</span>
                        <span className="text-xs text-muted/60">
                          llevaste {l.cantidad} · vendiste {vendidas}
                        </span>
                      </div>
                      <div className="flex gap-3">
                        <NumberField className="flex-1" value={c.remanente} onChange={v => setC(l.productoId, 'remanente', v ?? 0)} minValue={0} maxValue={l.cantidad}>
                          <Label>Quedaron</Label>
                          <NumberField.Group>
                            <NumberField.DecrementButton />
                            <NumberField.Input />
                            <NumberField.IncrementButton />
                          </NumberField.Group>
                        </NumberField>
                        <NumberField className="flex-1" value={c.merma} onChange={v => setC(l.productoId, 'merma', v ?? 0)} minValue={0} maxValue={l.cantidad}>
                          <Label>Se mermaron</Label>
                          <NumberField.Group>
                            <NumberField.DecrementButton />
                            <NumberField.Input />
                            <NumberField.IncrementButton />
                          </NumberField.Group>
                        </NumberField>
                      </div>
                    </div>
                  )
                })}

                <NumberField value={efectivo} onChange={v => setEfectivo(v ?? 0)} minValue={0} step={1000} formatOptions={{ style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }}>
                  <Label>Efectivo que tenés (incluye el fondo)</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                </NumberField>

                <NumberField value={qr} onChange={v => setQr(v ?? 0)} minValue={0} step={500} formatOptions={{ style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }}>
                  <Label>Total cobrado por QR</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                </NumberField>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                    Esos QR cayeron a…
                  </p>
                  <ToggleButtonGroup
                    selectionMode="single"
                    selectedKeys={new Set([qrDestino])}
                    onSelectionChange={k => setQrDestino(([...k][0] as DestinoQR) ?? 'negocio')}
                    size="sm"
                  >
                    <ToggleButton id="negocio">Cuenta del negocio</ToggleButton>
                    <ToggleButton id="vendedor">Mi cuenta</ToggleButton>
                  </ToggleButtonGroup>
                </div>

                <TextField value={nota} onChange={setNota}>
                  <Label>Nota (opcional)</Label>
                  <Input placeholder="Ej: llovió, vendí menos" />
                </TextField>

                {/* preview del arqueo */}
                {preview && (
                  <div className="rounded-xl bg-surface-secondary border border-border p-3 text-sm num">
                    <div className="flex justify-between"><span className="text-muted">Vendiste</span><b>{fmtMoney(preview.ventas)}</b></div>
                    <div className="flex justify-between"><span className="text-muted">Debería haber</span><b>{fmtMoney(preview.esp)}</b></div>
                    <div className="flex justify-between font-bold">
                      <span>Diferencia</span>
                      <span className={preview.dif < 0 ? 'text-warm' : 'text-success'}>{fmtMoney(preview.dif)}</span>
                    </div>
                  </div>
                )}

                <Button size="lg" onPress={cerrarDia}>
                  Cerrar el día
                </Button>
              </Card.Content>
            </Card>
          )}

          {(jornada.estado === 'cerrada' || listo) && jornada.estado !== 'confirmada' && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Enviado</Alert.Title>
                <Alert.Description>
                  Cerraste a las {jornada.cierre ? fmtHora(jornada.cierre.cerradaAt) : '—'}. El dueño confirma la rendición.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {jornada.estado === 'confirmada' && (
            <Alert status="success">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Rendición confirmada</Alert.Title>
                <Alert.Description>El dueño ya vio tu rendición de hoy.</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </>
      )}
    </div>
  )
}
