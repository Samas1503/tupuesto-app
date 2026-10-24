// Dominio TuPuesto — wedge según decisions.md
// Arqueo por conteo físico: fondo + (cargado − remanente − merma) × precio = esperado

export type Rol = 'duenio' | 'vendedor' | 'admin'

/** A qué cuenta cae el dinero digital. 'negocio' = alias del dueño (default). */
export type DestinoQR = 'negocio' | 'vendedor'

export type MetodoPago = 'efectivo' | 'qr' | 'transferencia'

export interface Producto {
  id?: number
  nombre: string
  /** precio de venta al público */
  precio: number
  /** costo de producción — para margen estimado (opcional) */
  precioCosto?: number
  /** imagen del producto como dataURL (IndexedDB local) */
  imagen?: string
  /** ingredientes del producto (referencia del vendedor) */
  ingredientes?: string
  activo: boolean
  orden: number
}

/** una venta registrada por el vendedor durante el turno */
export interface Venta {
  id?: number
  jornadaId: number
  items: Linea[]
  /** total cobrado — calculado con el precio vigente al registrar */
  total: number
  metodoPago: MetodoPago
  createdAt: number
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
  /** eliminación lógica — el admin puede restaurar */
  eliminado?: boolean
  /** puesto habitual (opcional — el vínculo real es la jornada del día) */
  puestoId?: number
  /** correo del vendedor — destino del link de acceso/reseteo (con backend) */
  email?: string
  /** PIN de acceso (demo local — auth real espera backend). Nunca se muestra al dueño. */
  pin?: string
  /** true si debe elegir PIN nuevo en su próximo ingreso (alta/reseteo) */
  debeCambiarPin?: boolean
  activo: boolean
}

export interface Linea {
  productoId: number
  cantidad: number
}

/** reposición de mercadería en mitad del turno (la carga el dueño) */
export interface Reposicion {
  items: Linea[]
  createdAt: number
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

/** solicitud de un vendedor al dueño — baja de usuario o cierre anticipado */
export interface Solicitud {
  id?: number
  tipo: 'eliminar-usuario' | 'cierre-anticipado'
  /** turno al que aplica (cierre-anticipado) */
  jornadaId?: number
  /** usuario a eliminar */
  vendedorId: number
  /** quién lo pide */
  solicitadoPor: number
  motivo?: string
  estado: 'pendiente' | 'aprobada' | 'rechazada'
  createdAt: number
  resueltaAt?: number
}

export type EstadoJornada = 'abierta' | 'cerrada' | 'confirmada'

export interface Jornada {
  id?: number
  puestoId: number
  /** se asigna cuando el vendedor inicia su turno — null mientras el despacho está libre */
  vendedorId?: number
  /** YYYY-MM-DD */
  fecha: string
  /** fondo fijo que el dueño le da al vendedor — se fija al crear el turno */
  fondoCaja?: number
  /** mercadería que el dueño cargó al salir — la carga el dueño, no el vendedor */
  despacho: Linea[]
  /** reposiciones durante el turno — se venden igual, pero se registran aparte */
  reposiciones?: Reposicion[]
  /** sobrante de ayer que entra a la venta de hoy */
  saldoInicial?: Linea[]
  /** sobrante de ayer descartado — pérdida para el negocio */
  descarte?: Linea[]
  /** hora de fin del turno "HH:mm" — antes de horaFin−5' el cierre requiere aprobación */
  horaFin?: string
  /** el dueño aprobó un cierre anticipado */
  cierreAnticipadoOk?: boolean
  estado: EstadoJornada
  cierre?: Cierre
  confirmadaAt?: number
  createdAt: number
}

/** dueño de la cuenta — el admin del sistema los gestiona, no son usuarios de la operación diaria */
export interface Duenio {
  id?: number
  nombre: string
  email?: string
  pin?: string
  debeCambiarPin?: boolean
  activo: boolean
  eliminado?: boolean
}
