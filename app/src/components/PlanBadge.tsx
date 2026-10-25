import { useLiveQuery } from 'dexie-react-hooks'
import { Chip } from '@heroui/react'
import { db } from '../db'
import { planDe } from '../lib/planes'

/** sticker del plan activo del usuario de sesión — visible en el header */
export default function PlanBadge() {
  const usuario = useLiveQuery(
    () => db.usuarios.get(Number(localStorage.getItem('tp-user-id'))),
    [],
  )
  if (!usuario) return null
  const plan = planDe(usuario.plan)
  const precio = plan.precioUsd ? `USD ${plan.precioUsd}` : `$${plan.precioMensual.toLocaleString('es-AR')}`
  return (
    <Chip color="accent" variant="soft" size="sm" title={plan.beneficios.join(' · ')}>
      {plan.nombre} · {precio}
    </Chip>
  )
}
