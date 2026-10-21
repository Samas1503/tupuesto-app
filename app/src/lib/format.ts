export function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isoMenosDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export function fmtDif(n: number): string {
  if (n === 0) return '$0'
  return (n > 0 ? '+$' : '−$') + Math.abs(Math.round(n)).toLocaleString('es-AR')
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d}/${m}`
}

export function fmtHora(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
