import { useState } from 'react'
import { Alert, Button, Card, Chip, Label, ListBox, NumberField, Select } from '@heroui/react'
import { db } from '../db'
import { useDatos, useJornadasDe } from '../lib/data'
import { fmtFecha, fmtMoney, hoyISO, isoMenosDias } from '../lib/format'
import { despachoValor } from '../lib/arqueo'
import type { Jornada } from '../types'

function mananaISO(): string {
  return isoMenosDias(-1)
}

function chipEstado(j: Jornada) {
  if (j.estado === 'cerrada') return <Chip color="warning" variant="soft" size="sm">Cerró — falta tu OK</Chip>
  return <Chip color="success" variant="soft" size="sm">Confirmada</Chip>
}

export default function Despacho() {
  const { productos, puestos, vendedores } = useDatos()
  const [fecha, setFecha] = useState(hoyISO())
  const [puestoId, setPuestoId] = useState<number | null>(null)
  const [fondo, setFondo] = useState(20000)
  const [cant, setCant] = useState<Record<number, number>>({})
  const [editingId, setEditingId] = useState<number | null>(null)

  const jornadasEseDia = useJornadasDe(fecha)
  const activos = productos.filter(p => p.activo)
  const editando = editingId != null ? jornadasEseDia.find(j => j.id === editingId) : undefined
  const puestoSel = puestoId != null ? puestos.find(p => p.id === puestoId) : undefined
  const vendedorSel = puestoSel ? vendedores.find(v => v.puestoId === puestoSel.id && v.activo) : undefined
  // al editar, el vendedor de la jornada puede estar inactivo: nombre de respaldo
  const vendedorNombre =
    vendedorSel?.nombre ??
    (editando ? vendedores.find(v => v.id === editando.vendedorId)?.nombre : undefined)
  // la jornada en edición no cuenta como "ya cargada": es la misma, no un duplicado
  const yaExiste = puestoSel
    ? jornadasEseDia.find(j => j.puestoId === puestoSel.id && j.id !== editingId)
    : undefined

  const totalUnidades = Object.values(cant).reduce((a, c) => a + c, 0)

  function lineasDespacho() {
    return activos
      .map(p => ({ productoId: p.id!, cantidad: cant[p.id!] ?? 0 }))
      .filter(l => l.cantidad > 0)
  }

  async function crear() {
    if (!puestoSel || !vendedorSel || yaExiste) return
    const despacho = lineasDespacho()
    if (despacho.length === 0) return
    await db.jornadas.add({
      puestoId: puestoSel.id!,
      vendedorId: vendedorSel.id!,
      fecha,
      fondoCaja: fondo,
      despacho,
      estado: 'abierta',
      createdAt: Date.now(),
    })
    setCant({})
  }

  function editar(j: Jornada) {
    setEditingId(j.id!)
    setPuestoId(j.puestoId)
    setFondo(j.fondoCaja)
    const next: Record<number, number> = {}
    for (const l of j.despacho) next[l.productoId] = l.cantidad
    setCant(next)
  }

  function cancelarEdicion() {
    setEditingId(null)
    setCant({})
  }

  async function guardarCambios() {
    if (!editando) return
    const despacho = lineasDespacho()
    if (despacho.length === 0) return
    await db.jornadas.update(editando.id!, { fondoCaja: fondo, despacho })
    setEditingId(null)
    setCant({})
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Despacho</h1>
        <p className="text-sm text-muted">
          Cargás vos lo que sale. El vendedor solo cuenta al cerrar — nunca declara esto.
        </p>
      </div>

      {/* atajos de fecha (trabados mientras se edita: la jornada es de este día) */}
      <div className="flex gap-2">
        {[hoyISO(), mananaISO()].map(f => (
          <Button
            key={f}
            size="sm"
            variant={fecha === f ? 'primary' : 'outline'}
            isDisabled={editando != null}
            onPress={() => setFecha(f)}
          >
            {f === hoyISO() ? `Hoy · ${fmtFecha(f)}` : `Mañana · ${fmtFecha(f)}`}
          </Button>
        ))}
      </div>

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

      {puestoSel && (
        <Card>
          <Card.Header className="px-4 pt-4 pb-0">
            <div className="flex justify-between items-center w-full">
              <Card.Title className="text-base">
                {puestoSel.nombre} · {vendedorNombre ?? 'sin vendedor'}
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
                Ya existe una jornada para este puesto el {fmtFecha(fecha)} (estado: {yaExiste.estado},
                despacho {fmtMoney(despachoValor(yaExiste, productos))}).
              </p>
            ) : !vendedorSel && !editando ? (
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Sin vendedor asignado</Alert.Title>
                  <Alert.Description>
                    Asigná uno en la pestaña Puestos antes de despachar.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            ) : (
              <>
                <NumberField
                  value={fondo}
                  onChange={v => setFondo(v ?? 0)}
                  minValue={0}
                  step={1000}
                  formatOptions={{ style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }}
                >
                  <Label>Fondo de caja (cambio)</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                </NumberField>

                <p className="text-xs font-bold uppercase tracking-wide text-muted mt-2">
                  Mercadería que lleva
                </p>
                {activos.map(p => (
                  <NumberField
                    key={p.id}
                    value={cant[p.id!] ?? 0}
                    onChange={v => setCant(prev => ({ ...prev, [p.id!]: v ?? 0 }))}
                    minValue={0}
                  >
                    <Label>
                      {p.nombre} <span className="text-muted/60 font-normal num">{fmtMoney(p.precio)}</span>
                    </Label>
                    <NumberField.Group>
                      <NumberField.DecrementButton />
                      <NumberField.Input />
                      <NumberField.IncrementButton />
                    </NumberField.Group>
                  </NumberField>
                ))}

                <div className="flex gap-2 mt-2">
                  {editando && (
                    <Button variant="tertiary" onPress={cancelarEdicion}>
                      Cancelar
                    </Button>
                  )}
                  <Button
                    className="flex-1"
                    onPress={editando ? guardarCambios : crear}
                    isDisabled={totalUnidades === 0 || (!editando && !vendedorSel)}
                  >
                    {editando ? 'Guardar cambios' : `Crear jornada · ${totalUnidades} u.`}
                  </Button>
                </div>
              </>
            )}
          </Card.Content>
        </Card>
      )}

      {/* jornadas existentes ese día */}
      {jornadasEseDia.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
            Jornadas del {fmtFecha(fecha)}
          </p>
          <div className="flex flex-col gap-2">
            {jornadasEseDia.map(j => (
              <Card key={j.id} >
                <Card.Content className="px-4 py-3 flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <b className="text-sm">{puestos.find(p => p.id === j.puestoId)?.nombre}</b>
                    <span className="text-sm text-muted">
                      {' '}· {vendedores.find(v => v.id === j.vendedorId)?.nombre} · fondo {fmtMoney(j.fondoCaja)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm num font-semibold">{fmtMoney(despachoValor(j, productos))}</span>
                    {j.estado === 'abierta' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={editingId === j.id}
                        onPress={() => editar(j)}
                      >
                        Editar
                      </Button>
                    ) : (
                      chipEstado(j)
                    )}
                  </div>
                </Card.Content>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
