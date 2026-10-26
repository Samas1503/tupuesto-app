/** Planes de suscripción — límites, precios y beneficios por tier */
export type PlanId = 'basico' | 'estandar' | 'premium' | 'fundador'

export interface Plan {
  id: PlanId
  nombre: string
  precioMensual: number          // ARS/mes — 0 cuando el precio es en USD (fundador)
  precioUsd?: number             // USD/mes — fundador: precio fijo en dólares cobrado en pesos al cambio
  maxVendedores: number          // -1 = ilimitado
  maxPuestos: number
  maxProductos: number
  beneficios: string[]
}

export const PLANES: Record<PlanId, Plan> = {
  basico: {
    id: 'basico', nombre: 'Básico', precioMensual: 13000,
    maxVendedores: 3, maxPuestos: 3, maxProductos: 25,
    beneficios: ['Hasta 3 puestos', 'Hasta 3 vendedores', 'Rendición diaria', 'Stats básicos'],
  },
  estandar: {
    id: 'estandar', nombre: 'Estándar', precioMensual: 25000,
    maxVendedores: 10, maxPuestos: 10, maxProductos: 100,
    beneficios: ['Hasta 10 puestos', 'Hasta 10 vendedores', 'Rendición + stats', 'Solicitudes de cierre', 'Soporte prioritario'],
  },
  fundador: {
    id: 'fundador', nombre: 'Fundador', precioMensual: 0,
    precioUsd: 10,
    maxVendedores: -1, maxPuestos: -1, maxProductos: -1,
    beneficios: ['Puestos y vendedores ilimitados', 'Precio fundador de por vida — USD 10 cobrado en pesos', 'Participación en nuevas features', 'Badge fundador', 'Solo 5 cupos'],
  },
  premium: {
    id: 'premium', nombre: 'Premium', precioMensual: 45000,
    maxVendedores: -1, maxPuestos: -1, maxProductos: -1,
    beneficios: ['Puestos ilimitados', 'Vendedores ilimitados', 'Rendición + stats + solicitudes', 'Reportes avanzados', 'Te ayudamos a arrancar 1 a 1'],
  },
}

/** límite del plan del dueño de la sesión — null/undefined = basico (default) */
export function planDe(plan?: string): Plan {
  return PLANES[(plan as PlanId) ?? 'basico'] ?? PLANES.basico
}

/** true si se puede crear otra entidad según el límite del plan */
export function permiteMas(plan: Plan, actual: number, tipo: 'vendedores' | 'puestos' | 'productos'): boolean {
  const max = tipo === 'vendedores' ? plan.maxVendedores : tipo === 'puestos' ? plan.maxPuestos : plan.maxProductos
  return max === -1 || actual < max
}
