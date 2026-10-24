import EmptyState from '../components/EmptyState'
import { useRef, useState, type ChangeEvent } from 'react'
import { AlertDialog, Button, Card, Input, Label, NumberField, Switch, TextField } from '@heroui/react'
import { db } from '../db'
import { useDatos } from '../lib/data'

const EUROS = { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 } as const

export default function Catalogo() {
  const { productos } = useDatos()
  const [nombre, setNombre] = useState('')
  const [nuevoCosto, setNuevoCosto] = useState(0)
  const [nuevoPrecio, setNuevoPrecio] = useState(0)
  const [nuevaFoto, setNuevaFoto] = useState('')
  const inputs = useRef<Record<number, HTMLInputElement | null>>({})
  const nuevoInput = useRef<HTMLInputElement | null>(null)

  async function setPrecio(id: number, precio: number) {
    if (precio >= 0) await db.productos.update(id, { precio })
  }
  async function setCosto(id: number, precioCosto: number) {
    if (precioCosto >= 0) await db.productos.update(id, { precioCosto })
  }
  async function setActivo(id: number, activo: boolean) {
    await db.productos.update(id, { activo })
  }
  function leerFoto(e: ChangeEvent<HTMLInputElement>, id?: number) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const r = new FileReader()
    r.onload = async () => {
      const imagen = String(r.result)
      if (id != null) await db.productos.update(id, { imagen })
      else setNuevaFoto(imagen)
    }
    r.readAsDataURL(f)
  }
  async function agregar() {
    const n = nombre.trim()
    if (!n || nuevoPrecio <= 0) return
    const orden = Math.max(0, ...productos.map(p => p.orden)) + 1
    await db.productos.add({
      nombre: n,
      precio: nuevoPrecio,
      precioCosto: nuevoCosto || undefined,
      imagen: nuevaFoto || undefined,
      activo: true,
      orden,
    })
    setNombre('')
    setNuevoCosto(0)
    setNuevoPrecio(0)
    setNuevaFoto('')
  }

  const foto = (p: { id?: number; nombre: string; imagen?: string }) =>
    p.imagen ? (
      <img src={p.imagen} alt="" className="h-14 w-14 rounded object-cover shrink-0" />
    ) : (
      <div className="h-14 w-14 rounded bg-accent text-white flex items-center justify-center font-extrabold text-lg shrink-0">
        {p.nombre.slice(0, 1).toUpperCase()}
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Precios</h1>
        <p className="text-sm text-muted">
          Cambiás acá y vale para todos los puestos. El arqueo usa el precio vigente del día.
        </p>
      </div>

      {/* FAB: agregar producto */}
      <AlertDialog>
        <Button
          aria-label="Agregar producto"
          className="!fixed right-4 !bottom-[calc(5.5rem+env(safe-area-inset-bottom))] !z-40
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
                <AlertDialog.Heading>Agregar producto</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {nuevaFoto ? (
                      <img src={nuevaFoto} alt="" className="h-14 w-14 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-14 w-14 rounded bg-accent/20 flex items-center justify-center shrink-0" />
                    )}
                    <TextField className="flex-1" value={nombre} onChange={setNombre}>
                      <Label>Nombre</Label>
                      <Input placeholder="Ej: Empanada" />
                    </TextField>
                    <input
                      ref={nuevoInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => leerFoto(e)}
                    />
                    <Button size="sm" variant="tertiary" onPress={() => nuevoInput.current?.click()}>
                      Foto
                    </Button>
                  </div>
                  <div className="flex gap-3">
                    <NumberField
                      className="flex-1"
                      value={nuevoCosto}
                      onChange={v => setNuevoCosto(v ?? 0)}
                      minValue={0}
                      step={50}
                      formatOptions={EUROS}
                    >
                      <Label>Costo</Label>
                      <NumberField.Group>
                        <NumberField.Input />
                      </NumberField.Group>
                    </NumberField>
                    <NumberField
                      className="flex-1"
                      value={nuevoPrecio}
                      onChange={v => setNuevoPrecio(v ?? 0)}
                      minValue={0}
                      step={100}
                      formatOptions={EUROS}
                    >
                      <Label>Venta</Label>
                      <NumberField.Group>
                        <NumberField.Input />
                      </NumberField.Group>
                    </NumberField>
                  </div>
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">Cancelar</Button>
                <Button slot="close" variant="primary" onPress={agregar} isDisabled={!nombre.trim() || nuevoPrecio <= 0}>
                  Agregar
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>

      {/* lista */}
      <div className="flex flex-col gap-2">
        {productos.length === 0 && (
          <Card>
            <Card.Content className="p-2">
              <EmptyState
                titulo="Sin productos"
                descripcion="Todavía no hay productos cargados en el catálogo — el primero ya define precio, costo y foto."
                hint="Agregá el primero con el botón +"
              />
            </Card.Content>
          </Card>
        )}
        {productos.map(p => (
          <Card key={p.id} className={p.activo ? '' : 'opacity-50'}>
            <Card.Content className="px-4 py-3 flex items-center gap-3 flex-wrap">
              {foto(p)}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{p.nombre}</p>
                {(p.precioCosto ?? 0) > 0 && p.precio > 0 && (
                  <p className="text-xs text-muted num">
                    margen {Math.round(((p.precio - (p.precioCosto ?? 0)) / p.precio) * 100)}%
                  </p>
                )}
              </div>
              <NumberField
                className="w-28"
                value={p.precioCosto ?? 0}
                onChange={v => setCosto(p.id!, v ?? 0)}
                minValue={0}
                step={50}
                formatOptions={EUROS}
              >
                <Label>Costo</Label>
                <NumberField.Group>
                  <NumberField.Input />
                </NumberField.Group>
              </NumberField>
              <NumberField
                className="w-28"
                value={p.precio}
                onChange={v => setPrecio(p.id!, v ?? 0)}
                minValue={0}
                step={50}
                formatOptions={EUROS}
              >
                <Label>Venta</Label>
                <NumberField.Group>
                  <NumberField.Input />
                </NumberField.Group>
              </NumberField>
              <input
                ref={el => {
                  inputs.current[p.id!] = el
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => leerFoto(e, p.id!)}
              />
              <Button
                size="sm"
                variant="tertiary"
                aria-label={`Foto de ${p.nombre}`}
                onPress={() => inputs.current[p.id!]?.click()}
              >
                Foto
              </Button>
              <Switch
                isSelected={p.activo}
                onChange={v => setActivo(p.id!, v)}
                aria-label={`Activo ${p.nombre}`}
              />
            </Card.Content>
          </Card>
        ))}
      </div>
    </div>
  )
}
