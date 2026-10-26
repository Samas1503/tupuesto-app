// Iconos SVG propios del sistema — stroke currentColor → heredan el color
// del texto/tema activo (dinámicos por categoría, sin librería externa).
type P = { className?: string }
const Svg = ({ className, children }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={className ?? 'text-xl leading-none h-5 w-5'}>
    {children}
  </svg>
)

/** Hoy — reloj con sol */
export const IHoy = ({ className }: P) => (
  <Svg className={className}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Svg>
)
/** Despacho — caja de entrega */
export const IDespacho = ({ className }: P) => (
  <Svg className={className}><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></Svg>
)
/** Precios — etiqueta */
export const IPrecios = ({ className }: P) => (
  <Svg className={className}><path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/></Svg>
)
/** Puestos — kiosco/puesto ambulante */
export const IPuestos = ({ className }: P) => (
  <Svg className={className}><path d="M4 9l8-5 8 5M4 9v10h16V9"/><path d="M9 19v-6h6v6"/></Svg>
)
/** Equipo — dos personas */
export const IEquipo = ({ className }: P) => (
  <Svg className={className}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-5 5.5-5s4.9 2 5.5 5"/><circle cx="16.5" cy="9" r="2.4"/><path d="M17 14.3c2 .5 3.5 2.2 4 4.2"/></Svg>
)
/** Stats — barras */
export const IStats = ({ className }: P) => (
  <Svg className={className}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></Svg>
)

/** Reportes — lupa sobre gráfico */
export const IReportes = ({ className }: P) => (
  <Svg className={className}><path d="M4 19V9M10 19V4M16 19v-6"/><circle cx="17" cy="15" r="3.5"/><path d="M19.5 17.5L22 20"/></Svg>
)

/** Campana de notificaciones */
export const INotif = ({ className }: P) => (
  <Svg className={className}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></Svg>
)
/** Cierre/confirmado — check en círculo */
export const ICheck = ({ className }: P) => (
  <Svg className={className}><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/></Svg>
)
/** Caja/stock */
export const ICaja = ({ className }: P) => (
  <Svg className={className}><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></Svg>
)
/** Persona/login */
export const IPersona = ({ className }: P) => (
  <Svg className={className}><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></Svg>
)
/** Info del sistema */
export const IInfo = ({ className }: P) => (
  <Svg className={className}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 12v4"/></Svg>
)
/** Soporte — signo de pregunta en círculo */
export const ISoporte = ({ className }: P) => (
  <Svg className={className}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.8.4-.9.9-.9 1.7"/><path d="M12 17h.01"/></Svg>
)
