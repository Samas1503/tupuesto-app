import { useState } from 'react'
import { Alert, Button, Card, Input, Label, Switch, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { db } from '../db'
import { useDatos } from '../lib/data'
import type { DestinoQR } from '../types'

export default function Puestos() {
  const { puestos, vendedores } = useDatos()
  const [nombreP, setNombreP] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [nombreV, setNombreV] = useState('')

  async function setQr(puestoId: number, keys: Set<string>) {
    const d = [...keys][0] as DestinoQR | undefined
    if (d) await db.puestos.update(puestoId, { qrDestinoDefault: d })
  }
  async function setActivo(puestoId: number, activo: boolean) {
    await db.puestos.update(puestoId, { activo })
  }
  async function agregar() {
    const n = nombreP.trim()
    const v = nombreV.trim()
    if (!n || !v) return
    const pid = await db.puestos.add({
      nombre: n,
      ubicacion: ubicacion.trim(),
      qrDestinoDefault: 'negocio',
      activo: true,
    })
    await db.vendedores.add({ nombre: v, puestoId: pid as number, activo: true })
    setNombreP('')
    setUbicacion('')
    setNombreV('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Puestos</h1>
        <p className="text-sm text-muted">
          El destino del QR define si el cobro digital cae a tu cuenta o queda en "modo confianza".
        </p>
      </div>

      {puestos.map(p => {
        const v = vendedores.find(x => x.puestoId === p.id && x.activo)
        return (
          <Card key={p.id} className={p.activo ? '' : 'opacity-50'}>
            <Card.Header className="px-4 pt-4 pb-0">
              <div className="flex justify-between items-start w-full">
                <div>
                  <Card.Title className="text-base">{p.nombre}</Card.Title>
                  <Card.Description>
                    {p.ubicacion} · {v ? v.nombre : 'sin vendedor'}
                  </Card.Description>
                </div>
                <Switch isSelected={p.activo} onChange={x => setActivo(p.id!, x)} aria-label={`Activo ${p.nombre}`} />
              </div>
            </Card.Header>
            <Card.Content className="px-4 py-3 flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                Los QR de este puesto caen a…
              </p>
              <ToggleButtonGroup
                selectionMode="single"
                selectedKeys={new Set([p.qrDestinoDefault])}
                onSelectionChange={k => setQr(p.id!, k as Set<string>)}
                size="sm"
              >
                <ToggleButton id="negocio">Tu cuenta</ToggleButton>
                <ToggleButton id="vendedor">Cuenta del vendedor</ToggleButton>
              </ToggleButtonGroup>
              {p.qrDestinoDefault === 'vendedor' && (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Modo confianza</Alert.Title>
                    <Alert.Description>
                      Los cobros QR de este puesto quedan marcados como anomalía en la rendición.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Card.Content>
          </Card>
        )
      })}

      {/* nuevo puesto + vendedor */}
      <Card variant="transparent" className="border border-dashed border-muted/40">
        <Card.Content className="p-4 flex flex-col gap-3">
          <p className="font-bold text-sm">Nuevo puesto</p>
          <TextField value={nombreP} onChange={setNombreP}>
            <Label>Nombre del puesto</Label>
            <Input placeholder="Ej: Parque Rivadavia" />
          </TextField>
          <TextField value={ubicacion} onChange={setUbicacion}>
            <Label>Ubicación / zona</Label>
            <Input placeholder="Ej: Caballito" />
          </TextField>
          <TextField value={nombreV} onChange={setNombreV}>
            <Label>Vendedor que lo atiende</Label>
            <Input placeholder="Ej: Paula" />
          </TextField>
          <Button onPress={agregar} isDisabled={!nombreP.trim() || !nombreV.trim()}>
            Crear puesto + vendedor
          </Button>
        </Card.Content>
      </Card>
    </div>
  )
}
