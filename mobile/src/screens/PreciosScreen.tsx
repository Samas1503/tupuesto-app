/** Precios — catálogo del dueño. Port de views/Catalogo.tsx:
 *  lista con costo/venta/stockDia/activo · alta de producto.
 *  No portado: foto del producto (FileReader → dataURL); en mobile queda la
 *  inicial como placeholder. Si el producto trae `imagen` (dataURL remota) sí se muestra. */

import React, { useState } from 'react'
import { Image, Text, TextInput, View } from 'react-native'
import { C } from '../theme'
import { Btn, Card, CardBody, EmptyState, FAB, Field, H1, Muted, Num, Screen, Sheet, Sub, Toggle } from '../components/ui'
import { add, update } from '../lib/store'
import { useDatos } from '../lib/data'
import { fmtMoney } from '../lib/format'
import { pushRow } from '../lib/snake'
import type { Producto } from '../types'

function FotoProd({ p, size = 52 }: { p: { nombre: string; imagen?: string }; size?: number }) {
  if (p.imagen) {
    return <Image source={{ uri: p.imagen }} style={{ height: size, width: size, borderRadius: 10 }} />
  }
  return (
    <View style={{ height: size, width: size, borderRadius: 10, backgroundColor: '#635bff26', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.38, fontWeight: '900', color: C.blurple }}>{p.nombre.charAt(0)}</Text>
    </View>
  )
}

/** input $ compacto — NumField sin stepper para entrar el precio rápido */
function PrecioInput({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null)
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: C.muted, textTransform: 'uppercase' }}>{label}</Text>
      <TextInput
        value={txt ?? (value === 0 ? '' : String(value))}
        onChangeText={setTxt}
        onBlur={() => {
          const n = Number((txt ?? '').replace(/[^\d]/g, '')) || 0
          if (n >= 0 && n !== value) onCommit(n)
          setTxt(null)
        }}
        placeholder="$0"
        keyboardType="number-pad"
        style={{ borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: C.navy, fontVariant: ['tabular-nums'] }}
      />
    </View>
  )
}

export default function PreciosScreen() {
  const { productos, scope } = useDatos()
  const [modal, setModal] = useState(false)
  const [nombre, setNombre] = useState('')
  const [nuevoCosto, setNuevoCosto] = useState('')
  const [nuevoPrecio, setNuevoPrecio] = useState('')

  function setPrecio(id: number, precio: number) {
    if (precio < 0) return
    update('productos', id, { precio })
    void pushRow('productos', id)
  }
  function setCosto(id: number, precioCosto: number) {
    if (precioCosto < 0) return
    update('productos', id, { precioCosto })
    void pushRow('productos', id)
  }
  function setStockDia(id: number, stockDia: number) {
    if (stockDia < 0) return
    update('productos', id, { stockDia })
    void pushRow('productos', id)
  }
  function setActivo(id: number, activo: boolean) {
    update('productos', id, { activo })
    void pushRow('productos', id)
  }

  async function agregar() {
    const n = nombre.trim()
    const precio = Number(nuevoPrecio) || 0
    const costo = Number(nuevoCosto) || 0
    if (!n || precio <= 0) return
    const orden = Math.max(0, ...productos.map(p => p.orden)) + 1
    const id = add('productos', {
      duenioId: scope ?? undefined,
      nombre: n,
      precio,
      precioCosto: costo || undefined,
      activo: true,
      orden,
    })
    void pushRow('productos', id)
    setNombre('')
    setNuevoCosto('')
    setNuevoPrecio('')
    setModal(false)
  }

  const costoN = Number(nuevoCosto) || 0
  const precioN = Number(nuevoPrecio) || 0

  return (
    <Screen>
      <View>
        <H1>Precios</H1>
        <Sub>Cambiás acá y vale para todos los puestos. El arqueo usa el precio vigente del día.</Sub>
      </View>

      {productos.length === 0 && (
        <Card><CardBody>
          <EmptyState titulo="Sin productos" descripcion="Todavía no hay productos cargados en el catálogo — el primero ya define precio, costo y foto." hint="Agregá el primero con el botón +" />
        </CardBody></Card>
      )}

      {productos.map(p => (
        <Card key={p.id} style={p.activo ? undefined : { opacity: 0.5 }}>
          <CardBody style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <FotoProd p={p} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }} numberOfLines={1}>{p.nombre}</Text>
                {(p.precioCosto ?? 0) > 0 && p.precio > 0 && (
                  <Num style={{ fontSize: 11, fontWeight: '800', color: C.success }}>
                    {Math.round(((p.precio - (p.precioCosto ?? 0)) / p.precio) * 100)}% margen
                  </Num>
                )}
              </View>
              <Toggle value={p.activo} onChange={v => setActivo(p.id!, v)} label={`Activo ${p.nombre}`} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrecioInput label="Costo" value={p.precioCosto ?? 0} onCommit={v => setCosto(p.id!, v)} />
              <PrecioInput label="Venta" value={p.precio} onCommit={v => setPrecio(p.id!, v)} />
              <PrecioInput label="Stock hoy" value={p.stockDia ?? 0} onCommit={v => setStockDia(p.id!, v)} />
            </View>
          </CardBody>
        </Card>
      ))}

      <FAB onPress={() => setModal(true)} />

      <Sheet visible={modal} onClose={() => setModal(false)} title="Agregar producto"
        footer={
          <>
            <Btn variant="tertiary" flex onPress={() => setModal(false)}>Cancelar</Btn>
            <Btn flex disabled={!nombre.trim() || precioN <= 0} onPress={() => void agregar()}>Agregar</Btn>
          </>
        }>
        <Field label="Nombre" value={nombre} onChange={setNombre} placeholder="Ej: Empanada" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Costo" value={nuevoCosto} onChange={setNuevoCosto} numeric placeholder="$0" style={{ flex: 1 }} />
          <Field label="Venta" value={nuevoPrecio} onChange={setNuevoPrecio} numeric placeholder="$0" style={{ flex: 1 }} />
        </View>
        {precioN > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#635bff14', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Muted style={{ fontSize: 11, fontWeight: '700' }}>MARGEN</Muted>
            <Num style={{ fontSize: 16, fontWeight: '800', color: C.blurple }}>
              {costoN > 0 && costoN < precioN ? `${Math.round(((precioN - costoN) / precioN) * 100)}%` : '—'}
            </Num>
          </View>
        )}
      </Sheet>
    </Screen>
  )
}
