// Ilustración por sección — SVG stroke currentColor → se tiñe con el accent del tema
type Icono = 'puesto' | 'equipo' | 'jornada' | 'dinero' | 'puntaje' | 'contrato' | 'producto' | 'despacho' | 'default'

const ILUSTRACIONES: Record<Icono, React.ReactNode> = {
  puesto: <><path d="M28 40l20-14 20 14M30 40v26h36V40" /><path d="M42 66V52h12v14"/><path d="M24 70h48"/></>,
  equipo: <><circle cx="36" cy="36" r="8"/><path d="M22 66c1.5-8 6.5-13 14-13s12.5 5 14 13"/><circle cx="60" cy="40" r="6"/><path d="M62 56c6 1 10 5 11 10"/></>,
  jornada: <><circle cx="48" cy="46" r="20"/><path d="M48 34v12l8 5"/><path d="M30 22l-6 6M66 22l6 6"/></>,
  dinero: <><rect x="24" y="34" width="48" height="30" rx="5"/><circle cx="48" cy="49" r="8"/><path d="M32 40h4M60 58h4"/></>,
  puntaje: <><path d="M34 26h28v10a14 14 0 0 1-28 0V26z"/><path d="M34 30h-8a6 6 0 0 0 6 10M62 30h8a6 6 0 0 1-6 10"/><path d="M42 66h12l-2-8h-8l-2 8z"/><path d="M36 74h24"/></>,
  contrato: <><rect x="28" y="20" width="40" height="56" rx="5"/><path d="M36 32h24M36 40h24M36 48h16"/><path d="M38 62c4-3 6 1 8-2s4 1 6-2" /></>,
  producto: <><path d="M28 38l20-12 20 12v20l-20 12-20-12V38z"/><path d="M28 38l20 12 20-12M48 50v20"/></>,
  despacho: <><rect x="24" y="34" width="34" height="24" rx="4"/><path d="M58 42h12l4 8v8h-16"/><circle cx="36" cy="62" r="5"/><circle cx="64" cy="62" r="5"/></>,
  default: <><rect x="28" y="26" width="40" height="44" rx="8"/><path d="M36 38h24M36 48h16"/></>,
}

export default function EmptyState({ titulo, descripcion, hint, icono = 'default' }: {
  titulo: string
  descripcion: string
  hint?: string
  icono?: Icono
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" className="text-accent">
        <rect x="16" y="16" width="64" height="64" rx="18" fill="currentColor" opacity="0.07" stroke="none" />
        {ILUSTRACIONES[icono]}
      </svg>
      <div>
        <p className="font-bold text-sm">{titulo}</p>
        <p className="text-xs text-muted mt-1 max-w-56 mx-auto">{descripcion}</p>
        {hint && <p className="text-[0.65rem] text-muted/60 mt-2">{hint}</p>}
      </div>
    </div>
  )
}
