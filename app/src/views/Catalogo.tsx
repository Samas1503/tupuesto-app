import EmptyState from '../components/EmptyState'
import ProdIcon from '../components/ProdIcon'
import { useRef, useState, type ChangeEvent } from 'react'
import { AlertDialog, Button, Card, Input, Label, NumberField, Switch, TextField } from '@heroui/react'
import { db } from '../db'
import { useDatos } from '../lib/data'
import { pushRow } from '../lib/snake'

const EUROS = { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 } as const

export default function Catalogo() {
  const { productos , scope } = useDatos()
  const [nombre, setNombre] = useState('')
  const [nuevoCosto, setNuevoCosto] = useState(0)
  const [nuevoPrecio, setNuevoPrecio] = useState(0)
  const [nuevaFoto, setNuevaFoto] = useState('')
  const inputs = useRef<Record<number, HTMLInputElement | null>>({})
  const nuevoInput = useRef<HTMLInputElement | null>(null)

  async function setPrecio(id: number, precio: number) {
    if (precio < 0) return
    await db.productos.update(id, { precio })
    void pushRow('productos', id)
  }
  async function setCosto(id: number, precioCosto: number) {
    if (precioCosto < 0) return
    await db.productos.update(id, { precioCosto })
    void pushRow('productos', id)
  }

  async function setStockDia(id: number, stockDia: number) {
    if (stockDia < 0) return
    await db.productos.update(id, { stockDia })
    void pushRow('productos', id)
  }
  async function setActivo(id: number, activo: boolean) {
    await db.productos.update(id, { activo })
    void pushRow('productos', id)
  }
  function leerFoto(e: ChangeEvent<HTMLInputElement>, id?: number) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const r = new FileReader()
    r.onload = async () => {
      const imagen = String(r.result)
      if (id != null) {
        await db.productos.update(id, { imagen })
        void pushRow('productos', id)
      } else {
        setNuevaFoto(imagen)
      }
    }
    r.readAsDataURL(f)
  }
  async function agregar() {
    const n = nombre.trim()
    if (!n || nuevoPrecio <= 0) return
    const orden = Math.max(0, ...productos.map(p => p.orden)) + 1
    const id = await db.productos.add({
        duenioId: scope ?? undefined,
      nombre: n,
      precio: nuevoPrecio,
      precioCosto: nuevoCosto || undefined,
      imagen: nuevaFoto || undefined,
      activo: true,
      orden,
    })
    void pushRow('productos', id)
    setNombre('')
    setNuevoCosto(0)
    setNuevoPrecio(0)
    setNuevaFoto('')
  }

  const foto = (p: { id?: number; nombre: string; imagen?: string }) =>
    p.imagen ? (
      <img src={p.imagen} alt="" className="h-14 w-14 rounded object-cover shrink-0" />
    ) : (
      <div className="h-14 w-14 rounded bg-accent/15 flex items-center justify-center shrink-0">
        <ProdIcon nombre={p.nombre} />
      </div>
    )

  const fotoBtn = (p: { id?: number; nombre: string; imagen?: string }) => (
    <button
      type="button"
      onClick={() => inputs.current[p.id!]?.click()}
      className="shrink-0 rounded overflow-hidden hover:opacity-80 transition-opacity"
      aria-label={`Cambiar foto de ${p.nombre}`}
    >
      {foto(p)}
    </button>
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
                    <button
                      type="button"
                      onClick={() => nuevoInput.current?.click()}
                      className="h-20 w-20 rounded-2xl overflow-hidden shrink-0 border-2 border-dashed border-accent/40 hover:border-accent hover:bg-accent/10 transition-colors flex items-center justify-center"
                      aria-label="Elegir foto"
                    >
                      {nuevaFoto ? (
                        <img src={nuevaFoto} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-accent text-3xl font-light">+</span>
                      )}
                    </button>
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
                  {nuevoPrecio > 0 && (
                    <div className="flex justify-between items-baseline bg-accent/8 rounded-xl px-3.5 py-2.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted">Margen</span>
                      <b className="text-lg num text-accent">
                        {nuevoCosto > 0 && nuevoCosto < nuevoPrecio
                          ? `${Math.round(((nuevoPrecio - nuevoCosto) / nuevoPrecio) * 100)}%`
                          : '—'}
                      </b>
                    </div>
                  )}
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
            <Card.Content className="px-4 py-3.5 flex flex-col gap-3">
              {/* fila 1: foto + nombre + margen + switch */}
              <div className="flex items-center gap-3">
                {fotoBtn(p)}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.nombre}</p>
                  {(p.precioCosto ?? 0) > 0 && p.precio > 0 && (
                    <span className="inline-block mt-0.5 text-[0.68rem] num font-bold text-success bg-success/10 rounded-full px-2 py-0.5">
                      {Math.round(((p.precio - (p.precioCosto ?? 0)) / p.precio) * 100)}% margen
                    </span>
                  )}
                </div>
                <Switch
                  isSelected={p.activo}
                  onChange={v => setActivo(p.id!, v)}
                  aria-label={`Activo ${p.nombre}`}
                />
                <input
                  ref={el => {
                    inputs.current[p.id!] = el
                  }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => leerFoto(e, p.id!)}
                />
              </div>
              {/* fila 2: costo + venta lado a lado */}
              <div className="flex gap-3">
                <NumberField
                  className="flex-1"
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
                  className="flex-1"
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
                <NumberField
                  className="flex-1"
                  value={p.stockDia ?? 0}
                  onChange={v => setStockDia(p.id!, v ?? 0)}
                  minValue={0}
                  step={1}
                >
                  <Label>Stock hoy</Label>
                  <NumberField.Group>
                    <NumberField.Input />
                  </NumberField.Group>
                </NumberField>
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>
    </div>
  )
}
