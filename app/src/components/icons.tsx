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
