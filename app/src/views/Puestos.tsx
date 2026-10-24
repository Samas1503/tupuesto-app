import EmptyState from '../components/EmptyState'
import { useState } from 'react'
import { Alert, AlertDialog, Button, Card, Chip, Input, Label, Switch, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { db } from '../db'
import { useDatos, useJornadasDe } from '../lib/data'
import { despachoValor } from '../lib/arqueo'
import { fmtMoney, hoyISO } from '../lib/format'
import { pushRow } from '../lib/snake'
import type { DestinoQR, EstadoJornada } from '../types'

const COLOR_ESTADO: Record<EstadoJornada, 'default' | 'warning' | 'success'> = {
  abierta: 'default',
  cerrada: 'warning',
  confirmada: 'success',
}

export default function Puestos() {
  const { productos, puestos, vendedores , usuarios, scope } = useDatos()
  const jornadasHoy = useJornadasDe(hoyISO(), usuarios)
  const [nombreP, setNombreP] = useState('')
  const [ubicacion, setUbicacion] = useState('')

  async function setQr(puestoId: number, keys: Set<string>) {
    const d = [...keys][0] as DestinoQR | undefined
    if (d) {
      await db.puestos.update(puestoId, { qrDestinoDefault: d })
      void pushRow('puestos', puestoId)
    }
  }
  async function setActivo(puestoId: number, activo: boolean) {
    await db.puestos.update(puestoId, { activo })
    void pushRow('puestos', puestoId)
  }
  async function agregar() {
    const n = nombreP.trim()
    if (!n) return
    const id = await db.puestos.add({
        duenioId: scope ?? undefined,
      nombre: n,
      ubicacion: ubicacion.trim(),
      qrDestinoDefault: 'negocio',
      activo: true,
    })
    void pushRow('puestos', id)
    setNombreP('')
    setUbicacion('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Puestos</h1>
        <p className="text-sm text-muted">
          El destino del QR define si el cobro digital cae a tu cuenta o queda en "modo confianza".
        </p>
      </div>

      {puestos.length === 0 && (
        <Card>
          <Card.Content className="p-2">
            <EmptyState
              titulo="Sin puestos"
              descripcion="Todavía no registraste ningún punto de venta — cada uno define dónde se vende y cuánta caja se espera."
              hint="Creá el primero con el botón +"
            />
          </Card.Content>
        </Card>
      )}
      {puestos.map(p => {
        const j = jornadasHoy.find(x => x.puestoId === p.id)
        const v = j ? vendedores.find(x => x.id === j.vendedorId) : undefined
        return (
          <Card key={p.id} className={p.activo ? '' : 'opacity-50'}>
            <Card.Header className="px-4 pt-4 pb-0">
              <div className="flex justify-between items-start w-full">
                <div>
                  <Card.Title className="text-base">{p.nombre}</Card.Title>
                  <Card.Description>
                    {p.ubicacion} · {v ? v.nombre : 'sin turno hoy'}
                  </Card.Description>
                  {j && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted">
                      <Chip color={COLOR_ESTADO[j.estado]} variant="soft" size="sm">
                        {j.estado}
                      </Chip>
                      <span className="num">despacho {fmtMoney(despachoValor(j, productos))}</span>
                    </div>
                  )}
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

      {/* FAB: nuevo puesto — el vendedor se asigna cada día en Despacho */}
      <AlertDialog>
        <Button
          aria-label="Nuevo puesto"
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
                <AlertDialog.Heading>Nuevo puesto</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <div className="flex flex-col gap-3">
                  <TextField value={nombreP} onChange={setNombreP}>
                    <Label>Nombre del puesto</Label>
                    <Input placeholder="Ej: Parque Rivadavia" />
                  </TextField>
                  <TextField value={ubicacion} onChange={setUbicacion}>
                    <Label>Ubicación / zona</Label>
                    <Input placeholder="Ej: Caballito" />
                  </TextField>
                  <p className="text-xs text-muted">
                    El vendedor se asigna cada día al planificar en Despacho.
                  </p>
                </div>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">Cancelar</Button>
                <Button slot="close" variant="primary" onPress={agregar} isDisabled={!nombreP.trim()}>
                  Crear puesto
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  )
}
