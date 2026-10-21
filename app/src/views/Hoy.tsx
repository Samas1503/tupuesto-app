import { Alert, AlertDialog, Button, Card, Chip, Disclosure } from '@heroui/react'
import { db } from '../db'
import { useDatos, useJornadasDe, useJornadasRango } from '../lib/data'
import { fmtDif, fmtFecha, fmtHora, fmtMoney, hoyISO, isoMenosDias } from '../lib/format'
import { cobrado, diferencia, esperado, mermaUnidades, qrEnCero, qrFueraDeCuenta, vendidos } from '../lib/arqueo'
import type { Jornada } from '../types'

function estadoChip(j: Jornada) {
  if (j.estado === 'abierta') return <Chip color="default" variant="soft">Vendiendo</Chip>
  if (j.estado === 'cerrada') return <Chip color="warning" variant="soft">Cerró — falta tu OK</Chip>
  return <Chip color="success" variant="soft">Confirmada</Chip>
}

export default function Hoy() {
  const { productos, puestos, vendedores } = useDatos()
  const hoy = hoyISO()
  const jornadas = useJornadasDe(hoy)
  // histórico 28d para contrastar el flag "QR en cero" (D3)
  const rango28 = useJornadasRango(isoMenosDias(28), hoy)

  const nomV = (id: number) => vendedores.find(v => v.id === id)?.nombre ?? '?'
  const nomP = (id: number) => puestos.find(p => p.id === id)?.nombre ?? '?'

  // promedio QR/día del puesto en 28d (jornadas con cierre, excluye la jornada evaluada)
  const promQr28 = (puestoId: number, excluirId?: number) => {
    const js = rango28.filter(x => x.puestoId === puestoId && x.cierre && x.id !== excluirId)
    return js.length ? js.reduce((a, x) => a + x.cierre!.qrTotal, 0) / js.length : 0
  }

  // totales del día (solo jornadas con cierre)
  const cerradas = jornadas.filter(j => j.cierre)
  const totEfe = cerradas.reduce((a, j) => a + j.cierre!.efectivoContado, 0)
  const totQrNeg = cerradas.filter(j => j.cierre!.qrDestino === 'negocio').reduce((a, j) => a + j.cierre!.qrTotal, 0)
  const totQrVend = cerradas.filter(j => j.cierre!.qrDestino === 'vendedor').reduce((a, j) => a + j.cierre!.qrTotal, 0)
  const totDif = cerradas.reduce((a, j) => a + diferencia(j, productos), 0)
  const tot = Math.max(1, totEfe + totQrNeg + totQrVend)

  async function confirmar(j: Jornada) {
    await db.jornadas.update(j.id!, { estado: 'confirmada', confirmadaAt: Date.now() })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Hoy</h1>
        <span className="text-sm text-muted font-semibold capitalize">{fmtFecha(hoy)}</span>
      </div>

      {/* barra del día: efectivo / QR por destino */}
      {cerradas.length > 0 && (
        <Card>
          <Card.Content className="p-4">
            <div className="flex justify-between text-xs font-bold text-muted uppercase tracking-wide mb-2">
              <span>Cobrado hoy · {cerradas.length}/{jornadas.length} cerrados</span>
              <span className={`num ${totDif < 0 ? 'text-danger' : ''}`}>{fmtDif(totDif)}</span>
            </div>
            <div className="flex h-3 rounded-lg overflow-hidden bg-[var(--viz-track)]">
              <div className="bg-[var(--viz-cash)]" style={{ width: `${(totEfe / tot) * 100}%` }} />
              <div className="bg-[var(--viz-qr)]" style={{ width: `${(totQrNeg / tot) * 100}%` }} />
              <div className="bg-[image:var(--viz-qr-warn)]" style={{ width: `${(totQrVend / tot) * 100}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted">
              <span className="num">Efectivo {fmtMoney(totEfe)}</span>
              <span className="num">QR a tu cuenta {fmtMoney(totQrNeg)}</span>
              {totQrVend > 0 && (
                <span className="num text-danger font-semibold">QR a vendedor {fmtMoney(totQrVend)}</span>
              )}
            </div>
          </Card.Content>
        </Card>
      )}

      {jornadas.length === 0 && (
        <Alert>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Todavía no hay jornadas hoy</Alert.Title>
            <Alert.Description>
              Cargá el despacho de la mañana desde la pestaña Despacho.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {/* una tarjeta por jornada */}
      {jornadas.map(j => {
        const dif = j.cierre ? diferencia(j, productos) : 0
        const merma = mermaUnidades(j)
        // flag "QR en cero" solo si hay contraste con el historial (D3)
        const qr0Prom =
          j.estado !== 'abierta' && qrEnCero(j) ? promQr28(j.puestoId, j.id) : 0
        return (
          <Card key={j.id}>
            <Card.Header className="pb-0 pt-4 px-4">
              <div className="flex justify-between items-start w-full">
                <div>
                  <Card.Title className="text-base">{nomV(j.vendedorId)}</Card.Title>
                  <Card.Description>{nomP(j.puestoId)} · fondo {fmtMoney(j.fondoCaja)}</Card.Description>
                </div>
                {estadoChip(j)}
              </div>
            </Card.Header>
            <Card.Content className="px-4 py-3">
              {j.cierre ? (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-sm num">
                    <span className="text-muted">Esperado</span>
                    <b>{fmtMoney(esperado(j, productos))}</b>
                  </div>
                  <div className="flex justify-between text-sm num">
                    <span className="text-muted">Contado</span>
                    <b>{fmtMoney(cobrado(j))}</b>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {dif === 0 ? (
                      <Chip color="success" variant="soft">✓ Sin diferencia</Chip>
                    ) : (
                      <Chip color={dif < 0 ? 'danger' : 'warning'} variant="soft">
                        {dif < 0 ? `⚠ Faltan ${fmtMoney(-dif)}` : `Sobran ${fmtMoney(dif)}`}
                      </Chip>
                    )}
                    {merma > 0 && <Chip color="default" variant="soft">Merma {merma} u.</Chip>}
                    {qrFueraDeCuenta(j) && (
                      <Chip color="danger" variant="soft">QR a cuenta del vendedor</Chip>
                    )}
                    {qr0Prom > 0 && (
                      <Chip color="warning" variant="soft">
                        ⚠ Declaró $0 QR — su promedio es {fmtMoney(qr0Prom)}/día
                      </Chip>
                    )}
                    <span className="text-xs text-muted self-center ml-auto">
                      cerró {fmtHora(j.cierre.cerradaAt)}
                    </span>
                  </div>
                  <Disclosure>
                    <Disclosure.Heading>
                      <Button slot="trigger" variant="ghost" size="sm">
                        Ver vendido por producto
                        <Disclosure.Indicator />
                      </Button>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                      <Disclosure.Body className="px-1 pt-1 pb-0">
                        <ul className="grid grid-cols-2 gap-x-4 text-xs text-muted">
                          {productos
                            .filter(p => vendidos(j, p.id!) > 0)
                            .map(p => (
                              <li key={p.id} className="flex justify-between num">
                                <span>{p.nombre}</span>
                                <span>{vendidos(j, p.id!)} u.</span>
                              </li>
                            ))}
                        </ul>
                      </Disclosure.Body>
                    </Disclosure.Content>
                  </Disclosure>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Todavía no cerró. Despacho: {j.despacho.reduce((a, l) => a + l.cantidad, 0)} u. en
                  productos.
                </p>
              )}
            </Card.Content>
            {j.estado === 'cerrada' && (
              <Card.Footer className="px-4 pb-4 pt-0">
                <AlertDialog>
                  <Button size="sm">Confirmar rendición</Button>
                  <AlertDialog.Backdrop>
                    <AlertDialog.Container>
                      <AlertDialog.Dialog className="sm:max-w-[420px]">
                        <AlertDialog.CloseTrigger />
                        <AlertDialog.Header>
                          <AlertDialog.Icon status={dif < 0 ? 'danger' : 'accent'} />
                          <AlertDialog.Heading>
                            ¿Confirmar rendición de {nomV(j.vendedorId)}?
                          </AlertDialog.Heading>
                        </AlertDialog.Header>
                        <AlertDialog.Body>
                          <div className="flex flex-col gap-1 text-sm num">
                            <div className="flex justify-between">
                              <span className="text-muted">Esperado</span>
                              <b>{fmtMoney(esperado(j, productos))}</b>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">Contado</span>
                              <b>{fmtMoney(cobrado(j))}</b>
                            </div>
                            <div className="flex justify-between font-bold">
                              <span>Diferencia</span>
                              <span className={dif < 0 ? 'text-danger' : 'text-success'}>{fmtDif(dif)}</span>
                            </div>
                          </div>
                          {qrFueraDeCuenta(j) && (
                            <p className="text-sm text-danger mt-3 font-semibold">
                              ⚠ Cobró {fmtMoney(j.cierre!.qrTotal)} en QR a su cuenta personal.
                            </p>
                          )}
                        </AlertDialog.Body>
                        <AlertDialog.Footer>
                          <Button slot="close" variant="tertiary">Volver</Button>
                          <Button slot="close" onPress={() => confirmar(j)}>
                            Confirmar
                          </Button>
                        </AlertDialog.Footer>
                      </AlertDialog.Dialog>
                    </AlertDialog.Container>
                  </AlertDialog.Backdrop>
                </AlertDialog>
              </Card.Footer>
            )}
          </Card>
        )
      })}
    </div>
  )
}
