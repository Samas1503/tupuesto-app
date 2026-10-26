import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Chip } from '@heroui/react'
import { db } from '../db'
import { pushRow } from '../lib/snake'
import { fmtHora } from '../lib/format'

const ICONOS: Record<string, string> = {
  solicitud: '🔔', cierre: '✅', stock: '📦', login: '👤', sistema: 'ℹ️',
}

/** campana del header — panel tipo Instagram con las notificaciones del usuario */
export default function NotifBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sesionId = Number(localStorage.getItem('tp-user-id'))

  const notifs = useLiveQuery(
    () => db.notificaciones.where('usuarioId').equals(sesionId).reverse().sortBy('createdAt'),
    [sesionId],
  ) ?? []
  const noLeidas = notifs.filter(n => !n.leida)

  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])

  async function marcarTodas() {
    await db.notificaciones.where('usuarioId').equals(sesionId).filter(n => !n.leida).modify({ leida: true })
    for (const n of noLeidas) void pushRow('notificaciones', n.id!)
  }

  if (!sesionId) return null
  return (
    <div ref={ref} className="relative">
      <button onClick={() => { setOpen(!open); if (!open && noLeidas.length) void marcarTodas() }}
        className="relative p-1.5 text-lg" aria-label="Notificaciones">
        🔔
        {noLeidas.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-white">
            {noLeidas.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 max-w-[85vw] rounded-2xl border border-border bg-white shadow-xl z-50 max-h-96 overflow-y-auto">
          <p className="px-4 pt-3 pb-1 text-sm font-bold border-b border-border">Notificaciones</p>
          {notifs.length === 0 && <p className="p-4 text-xs text-muted">Sin notificaciones todavía.</p>}
          {notifs.slice(0, 30).map(n => (
            <div key={n.id} className={`flex gap-3 px-4 py-3 border-b border-border/50 ${n.leida ? '' : 'bg-accent/5'}`}>
              <span className="text-lg">{ICONOS[n.tipo] ?? 'ℹ️'}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-tight">{n.titulo}</p>
                <p className="text-xs text-muted leading-snug">{n.descripcion}</p>
                <p className="text-[0.6rem] text-muted/60 mt-0.5">{fmtHora(n.createdAt)}</p>
              </div>
              {!n.leida && <Chip color="accent" variant="soft" size="sm" className="ml-auto shrink-0">nueva</Chip>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
