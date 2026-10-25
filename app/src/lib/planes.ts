/** Planes de suscripción — límites, precios y beneficios por tier */
export type PlanId = 'basico' | 'estandar' | 'premium' | 'fundador'

export interface Plan {
  id: PlanId
  nombre: string
  precioMensual: number          // ARS/mes
  maxVendedores: number          // -1 = ilimitado
  maxPuestos: number
  maxProductos: number
  beneficios: string[]
}

export const PLANES: Record<PlanId, Plan> = {
  basico: {
    id: 'basico', nombre: 'Básico', precioMensual: 13000,
    maxVendedores: 2, maxPuestos: 2, maxProductos: 20,
    beneficios: ['Hasta 2 puestos', 'Hasta 2 vendedores', 'Rendición diaria', 'Stats básicos'],
  },
  estandar: {
    id: 'estandar', nombre: 'Estándar', precioMensual: 25000,
    maxVendedores: 5, maxPuestos: 5, maxProductos: 100,
    beneficios: ['Hasta 5 puestos', 'Hasta 5 vendedores', 'Todo del Básico', 'Contratos digitales', 'Soporte prioritario'],
  },
  fundador: {
    id: 'fundador', nombre: 'Fundador', precioMensual: 15000,
    maxVendedores: 5, maxPuestos: 5, maxProductos: 100,
    beneficios: ['Hasta 5 puestos', 'Hasta 5 vendedores', 'Precio fundador de por vida', 'Participación en nuevas features', 'Badge fundador', 'Soporte prioritario'],
  },
  premium: {
    id: 'premium', nombre: 'Premium', precioMensual: 45000,
    maxVendedores: -1, maxPuestos: -1, maxProductos: -1,
    beneficios: ['Puestos ilimitados', 'Vendedores ilimitados', 'Todo del Estándar', 'Reportes avanzados', 'Onboarding 1 a 1'],
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
