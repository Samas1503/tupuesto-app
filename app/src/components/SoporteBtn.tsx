import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertDialog, Button, TextField, Label, Input } from '@heroui/react'
import { db } from '../db'
import { notificar } from '../lib/notificar'

/** botón "Ayuda" en el header — el dueño/vendedor manda soporte al admin */
export default function SoporteBtn() {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState('')
  const [enviado, setEnviado] = useState(false)
  const sesionId = Number(localStorage.getItem('tp-user-id'))
  const usuario = useLiveQuery(() => db.usuarios.get(sesionId), [sesionId])

  if (!usuario || usuario.rol === 'admin') return null // el admin no se avisa a sí mismo

  async function enviar() {
    if (!msg.trim()) return
    const admins = await db.usuarios.where('rol').equals('admin').toArray()
    for (const a of admins) void notificar({
      usuarioId: a.id!, tipo: 'sistema',
      titulo: `Soporte — ${usuario!.nombre}`,
      descripcion: msg.trim(),
    })
    setMsg(''); setEnviado(true); setOpen(false)
    setTimeout(() => setEnviado(false), 3000)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="p-1.5 text-lg" aria-label="Soporte" title="Pedir soporte">
        ❓
      </button>
      {enviado && <p className="text-[0.65rem] text-success absolute top-full right-0 whitespace-nowrap">Enviado ✓</p>}
      <AlertDialog isOpen={open} onOpenChange={setOpen}>
        <AlertDialog.Backdrop><AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header><AlertDialog.Heading>Soporte técnico</AlertDialog.Heading></AlertDialog.Header>
            <AlertDialog.Body>
              <TextField value={msg} onChange={setMsg}>
                <Label>Contanos qué pasa</Label>
                <Input placeholder="Ej: el QR no se abre, no puedo cerrar el turno…" />
              </TextField>
              <p className="text-xs text-muted mt-1">Le llega una notificación al administrador — te responde por acá o por email.</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" slot="close">Cancelar</Button>
              <Button variant="primary" onPress={enviar} isDisabled={!msg.trim()}>Enviar</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container></AlertDialog.Backdrop>
      </AlertDialog>
    </>
  )
}
