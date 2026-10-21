import { useState } from 'react'
import { Button, Card, Input, Label, NumberField, Switch, TextField } from '@heroui/react'
import { db } from '../db'
import { useDatos } from '../lib/data'
import { fmtMoney } from '../lib/format'

export default function Catalogo() {
  const { productos } = useDatos()
  const [nombre, setNombre] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState(0)

  async function setPrecio(id: number, precio: number) {
    if (precio >= 0) await db.productos.update(id, { precio })
  }
  async function setActivo(id: number, activo: boolean) {
    await db.productos.update(id, { activo })
  }
  async function agregar() {
    const n = nombre.trim()
    if (!n || nuevoPrecio <= 0) return
    const orden = Math.max(0, ...productos.map(p => p.orden)) + 1
    await db.productos.add({ nombre: n, precio: nuevoPrecio, activo: true, orden })
    setNombre('')
    setNuevoPrecio(0)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Precios</h1>
        <p className="text-sm text-muted">
          Cambiás acá y vale para todos los puestos. El arqueo usa el precio vigente del día.
        </p>
      </div>

      {/* nuevo producto */}
      <Card>
        <Card.Content className="p-4 flex flex-col gap-3">
          <TextField value={nombre} onChange={setNombre}>
            <Label>Nuevo producto</Label>
            <Input placeholder="Ej: Empanada" />
          </TextField>
          <div className="flex gap-3 items-end">
            <NumberField
              className="flex-1"
              value={nuevoPrecio}
              onChange={v => setNuevoPrecio(v ?? 0)}
              minValue={0}
              step={100}
              formatOptions={{ style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }}
            >
              <Label>Precio</Label>
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>
            <Button onPress={agregar} isDisabled={!nombre.trim() || nuevoPrecio <= 0}>
              Agregar
            </Button>
          </div>
        </Card.Content>
      </Card>

      {/* lista */}
      <div className="flex flex-col gap-2">
        {productos.map(p => (
          <Card
            key={p.id}
            className={p.activo ? '' : 'opacity-50'}
          >
            <Card.Content className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{p.nombre}</p>
                <p className="text-xs text-muted/60 num">{fmtMoney(p.precio)}</p>
              </div>
              <NumberField
                className="w-32"
                value={p.precio}
                onChange={v => setPrecio(p.id!, v ?? 0)}
                minValue={0}
                step={50}
                formatOptions={{ style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }}
                aria-label={`Precio de ${p.nombre}`}
              >
                <NumberField.Group>
                  <NumberField.Input />
                </NumberField.Group>
              </NumberField>
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
