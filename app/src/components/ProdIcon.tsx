// Ilustración del producto según su nombre — SVG stroke currentColor,
// se tiñe con el accent del tema (categoría del dueño) automáticamente.
type P = { nombre: string; className?: string }
const S = ({ c }: { c: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">{c}</svg>
)
const k = (n: string, ...w: string[]) => w.some(x => n.includes(x))

export default function ProdIcon({ nombre, className }: P) {
  const n = nombre.toLowerCase()
  return (
    <span className={`text-accent ${className ?? ''}`}>
      {k(n, 'empanada')
        ? <S c={<><path d="M4 13c0-5 3.6-9 8-9s8 4 8 9-3.6 9-8 9-8-4-8-9z"/><path d="M4 13c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 2-.5"/></>} />
      : k(n, 'chipa', 'pan')
        ? <S c={<><path d="M4 12c0-4 3.5-7 8-7s8 3 8 7-3.5 7-8 7-8-3-8-7z"/><path d="M9 10c.5-1.5 1.5-2 3-2s2.5.5 3 2"/></>} />
      : k(n, 'docena', 'huevo')
        ? <S c={<><ellipse cx="12" cy="12" rx="6" ry="8"/></>} />
      : k(n, 'pizza')
        ? <S c={<><path d="M4 5l16 5-8 10V5z" transform="rotate(8 12 12)"/><circle cx="10" cy="9" r="1"/><circle cx="13" cy="13" r="1"/></>} />
      : k(n, 'cafe', 'cortado')
        ? <S c={<><path d="M4 9h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2"/><path d="M8 5c0-1 1-1 1-2M12 5c0-1 1-1 1-2"/></>} />
      : k(n, 'jugo', 'agua', 'gaseosa', 'cola', 'bebida')
        ? <S c={<><path d="M9 3h6v3l-1 2v11a2 2 0 0 1-2 2h0a2 2 0 0 1-2-2V8L9 6V3z"/><path d="M10 12h4"/></>} />
      : k(n, 'torta', 'postre', 'budin', 'flan')
        ? <S c={<><path d="M4 18h16M5 18V10l7-4 7 4v8"/><path d="M9 14h6"/></>} />
      : k(n, 'sandwich', 'sanguche')
        ? <S c={<><path d="M3 14l9-7 9 7M4 14v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/><path d="M7 14h10"/></>} />
      : k(n, 'churro', 'factura', 'medialuna')
        ? <S c={<><path d="M5 15c0-5 3-8 7-8s7 3 7 8-3 5-7 5-7-2-7-5z"/><path d="M9 13c0-2 1-4 3-4"/></>} />
      : k(n, 'helado')
        ? <S c={<><path d="M8 12h8l-4 9-4-9z"/><path d="M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="8" r="3"/></>} />
      : k(n, 'dulce', 'caramelo')
        ? <S c={<><rect x="7" y="9" width="10" height="6" rx="3"/><path d="M7 12H3l2-2M7 12H3l2 2M17 12h4l-2-2M17 12h4l-2 2"/></>} />
      : k(n, 'ropa', 'remera', 'remer')
        ? <S c={<><path d="M9 4L4 7l2 3 2-1v11h8V9l2 1 2-3-5-3a3 3 0 0 1-6 0z"/></>} />
      : k(n, 'zapat', 'ojota')
        ? <S c={<><path d="M3 16l10-5 8 2v4H3v-1z"/><path d="M3 18v1h18v-1"/></>} />
      : k(n, 'juguete', 'pelota')
        ? <S c={<><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4v16" transform="rotate(45 12 12)"/></>} />
      : <S c={<><path d="M20 8l-8-5-8 5v8l8 5 8-5V8z"/><path d="M4 8l8 5 8-5M12 13v8"/></>} />
      }
    </span>
  )
}
