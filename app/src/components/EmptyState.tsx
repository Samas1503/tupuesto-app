/** empty state con ilustración SVG de marca — para vistas sin datos */
export default function EmptyState({
  titulo, descripcion, hint,
}: {
  titulo: string
  descripcion: string
  /** pista del botón/acción que resuelve el estado (p. ej. el FAB +) */
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4">
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" aria-hidden>
        <rect x="18" y="26" width="60" height="50" rx="10" fill="#635bff" opacity="0.1" />
        <rect x="24" y="32" width="48" height="38" rx="7" stroke="#635bff" strokeWidth="2.5" />
        <path d="M36 32v-6a6 6 0 0 1 6-6h12a6 6 0 0 1 6 6v6" stroke="#635bff" strokeWidth="2.5" />
        <rect x="32" y="42" width="32" height="4" rx="2" fill="#635bff" opacity="0.4" />
        <rect x="32" y="51" width="22" height="4" rx="2" fill="#635bff" opacity="0.25" />
        <circle cx="72" cy="72" r="14" fill="#00d4ff" opacity="0.15" />
        <circle cx="72" cy="72" r="10" fill="#00d4ff" />
        <path d="M68 72h8M72 68v8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <p className="text-base font-extrabold mt-3">{titulo}</p>
      <p className="text-sm text-muted mt-1 max-w-60">{descripcion}</p>
      {hint && (
        <p className="text-xs text-accent font-semibold mt-2 bg-accent/10 rounded-full px-3 py-1">
          {hint}
        </p>
      )}
    </div>
  )
}
