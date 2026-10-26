// Dominio TuPuesto — wedge según decisions.md
// Arqueo por conteo físico: fondo + (cargado − remanente − merma) × precio = esperado

export type Rol = 'duenio' | 'vendedor' | 'admin'

/** categoría del negocio del dueño — define el tema (accent) de la app */
export type Categoria = 'comida' | 'postres' | 'ropa' | 'mercaderia' | 'juguetes' | 'otro'

/** usuario unificado (Neon: tabla `usuarios`) — admin, dueños y vendedores en una sola tabla */
export interface Usuario {
  id?: number
  rol: Rol
  nombre: string
  email?: string
  /** hash SHA-256 (hex) del PIN — nunca se guarda el PIN en claro */
  pinHash?: string
  /** true si debe elegir PIN nuevo en su próximo ingreso (alta/reseteo) */
  debeCambiarPin?: boolean
  activo: boolean
  /** eliminación lógica — el admin puede restaurar */
  eliminado?: boolean
  /** vendedor → el dueño de su cuenta (dueños/admin: undefined) */
  duenioId?: number
  /** solo dueños — 'otro' si no eligió (admin no tiene) */
  categoria?: Categoria
  /** plan de suscripción del dueño (basico|estandar|premium) */
  plan?: string
  /** compat con el modelo viejo: puesto habitual del vendedor (el vínculo real es la jornada) */
  puestoId?: number
}

/** A qué cuenta cae el dinero digital. 'negocio' = alias del dueño (default). */
export type DestinoQR = 'negocio' | 'vendedor'

export type MetodoPago = 'efectivo' | 'qr' | 'transferencia'

export interface Producto {
  /** dueño de la cuenta — scoping multi-tenant (Neon: duenio_id) */
  duenioId?: number
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
  /** unidades disponibles hoy — el dueño lo setea en Precios; sin stock no se puede despachar */
  stockDia?: number
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
  /** dueño de la cuenta — scoping multi-tenant (Neon: duenio_id) */
  duenioId?: number
  id?: number
  nombre: string
  ubicacion: string
  qrDestinoDefault: DestinoQR
  activo: boolean
}

/** @deprecated usar Usuario (rol 'vendedor') — alias para compat */
export type Vendedor = Usuario

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
  /** dueño de la cuenta — scoping multi-tenant (Neon: duenio_id) */
  duenioId?: number
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

/** @deprecated usar Usuario (rol 'duenio') — alias para compat */
export type Duenio = Usuario

/** notificación in-app — campana del header (sincroniza a Neon para cruzar dispositivos) */
export interface Notificacion {
  id?: number
  usuarioId: number           // a quién va dirigida
  tipo: 'solicitud' | 'cierre' | 'stock' | 'login' | 'sistema'
  titulo: string
  descripcion: string
  leida: boolean
  createdAt: number
}
