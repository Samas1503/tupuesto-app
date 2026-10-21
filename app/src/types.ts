// Dominio TuPuesto — wedge según decisions.md
// Arqueo por conteo físico: fondo + (cargado − remanente − merma) × precio = esperado

export type Rol = 'duenio' | 'vendedor'

/** A qué cuenta cae el dinero digital. 'negocio' = alias del dueño (default). */
export type DestinoQR = 'negocio' | 'vendedor'

export interface Producto {
  id?: number
  nombre: string
  precio: number
  activo: boolean
  orden: number
}

export interface Puesto {
  id?: number
  nombre: string
  ubicacion: string
  qrDestinoDefault: DestinoQR
  activo: boolean
}

export interface Vendedor {
  id?: number
  nombre: string
  puestoId: number
  activo: boolean
}

export interface Linea {
  productoId: number
  cantidad: number
}

export interface Cierre {
  /** unidades vendibles que vuelven */
  remanente: Linea[]
  /** unidades no vendibles (rotas, pasadas) */
  merma: Linea[]
  efectivoContado: number
  qrTotal: number
  qrDestino: DestinoQR
  nota?: string
  cerradaAt: number
}

export type EstadoJornada = 'abierta' | 'cerrada' | 'confirmada'

export interface Jornada {
  id?: number
  puestoId: number
  vendedorId: number
  /** YYYY-MM-DD */
  fecha: string
  /** fondo fijo que el dueño le da al vendedor para cambio */
  fondoCaja: number
  /** mercadería que el dueño cargó al salir — la carga el dueño, no el vendedor */
  despacho: Linea[]
  estado: EstadoJornada
  cierre?: Cierre
  confirmadaAt?: number
  createdAt: number
}
