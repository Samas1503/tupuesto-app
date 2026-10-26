/** Cliente de la API de contratos — port de lib/contratos.ts web.
 *  Cambios RN: URLs absolutas contra la API (no hay relative fetch) y se
 *  eliminó descargarPaquete (DOM Blob/anchor) — queda getPaquete() que
 *  devuelve el JSON; la pantalla lo comparte con la Share API nativa. */

import { API, authHeader } from './auth'

export interface Contrato {
  id: number | string
  token?: string
  /** link de firma que devuelve la API (si lo trae) — preferido sobre el armado local */
  link?: string
  tipo?: 'prueba15' | 'mensual'
  plazoMeses?: number
  esFundador?: boolean
  razonSocial: string
  cuit: string
  email: string
  domicilio?: string
  plan: string
  precio: number
  estado: string
  createdAt?: string | number
  firmadoAt?: string | number
  /** cuerpo del contrato ya renderizado por la plantilla — si la API lo devuelve */
  texto?: string
  pdfHash?: string
  duenioId?: number
}

export interface NuevoContrato {
  tipo?: 'prueba15' | 'mensual'
  plazoMeses?: number
  esFundador?: boolean
  razonSocial: string
  cuit: string
  email: string
  domicilio?: string
  plan: string
  precio: number
  duenioId?: number
}

/* ── helpers ───────────────────────────────────────────────────────── */

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init)
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { /* HTML de 404/SPA */ }
  if (!res.ok) {
    const d = data as Record<string, unknown> | null
    const msg = d?.error ?? d?.message
    throw new Error(typeof msg === 'string' ? msg : `Error del servidor (${res.status})`)
  }
  return data as T
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k]
    if (v != null && v !== '') return v
  }
  return undefined
}

/** aplana la fila: el backend guarda razón social/CUIT/email/plan dentro de
 *  `datos` JSONB — mergea esas keys con las del nivel superior */
export function normContrato(raw: unknown): Contrato {
  const r = (raw ?? {}) as Record<string, unknown>
  let datos: Record<string, unknown> = {}
  const d = r.datos
  if (typeof d === 'string') {
    try { datos = JSON.parse(d) as Record<string, unknown> } catch { /* ignora */ }
  } else if (d != null && typeof d === 'object') {
    datos = d as Record<string, unknown>
  }
  const m: Record<string, unknown> = { ...datos, ...r }

  const num = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  return {
    id: (pick(m, 'id', 'contrato_id', 'contratoId') ?? '') as number | string,
    token: pick(m, 'token', 'firma_token', 'token_firma', 'signing_token') as string | undefined,
    link: pick(m, 'link', 'link_firma', 'url_firma') as string | undefined,
    tipo: 'mensual' as const,
    razonSocial: String(pick(m, 'razonSocial', 'razon_social', 'razon', 'suscriptor') ?? ''),
    cuit: String(pick(m, 'cuit', 'CUIT') ?? ''),
    email: String(pick(m, 'email', 'mail', 'correo') ?? ''),
    domicilio: pick(m, 'domicilio', 'domicilio_legal', 'direccion') as string | undefined,
    plan: String(pick(m, 'plan') ?? ''),
    precio: num(pick(m, 'precio', 'monto', 'price')),
    estado: String(pick(m, 'estado', 'status') ?? 'enviado'),
    createdAt: pick(m, 'createdAt', 'created_at', 'creado_at', 'fecha') as string | number | undefined,
    firmadoAt: pick(m, 'firmadoAt', 'firmado_at', 'signed_at') as string | number | undefined,
    texto: pick(m, 'texto', 'cuerpo', 'contenido', 'contrato_texto', 'contratoTexto', 'texto_contrato', 'html') as string | undefined,
    pdfHash: pick(m, 'pdfHash', 'pdf_hash', 'hash') as string | undefined,
    duenioId: pick(m, 'duenioId', 'duenio_id') as number | undefined,
  }
}

function normLista(data: unknown): Contrato[] {
  const d = data as Record<string, unknown> | unknown[] | null
  const arr = Array.isArray(d) ? d
    : ((d?.contratos ?? d?.items ?? d?.rows ?? d?.data) as unknown[] | undefined) ?? []
  return (Array.isArray(arr) ? arr : []).map(normContrato)
}

function normUno(data: unknown): Contrato {
  const d = data as Record<string, unknown> | unknown[] | null
  const anidados = !Array.isArray(d) && d != null ? (d.contratos as unknown[] | undefined) : null
  const raw = Array.isArray(d) ? d[0]
    : ((d?.contrato as unknown) ?? (Array.isArray(anidados) ? anidados[0] : undefined) ?? d)
  return normContrato(raw)
}

/** link público de firma — prefiere el que devuelve la API; si no, lo arma
 *  contra la web app real (la firma sigue siendo web, no nativa) */
export function linkFirma(c: Pick<Contrato, 'token' | 'link'>): string {
  if (c.link) return c.link
  return `${API}/app/firmar?token=${encodeURIComponent(c.token ?? '')}`
}

/* ── endpoints ─────────────────────────────────────────────────────── */

/** GET /api/contratos — lista (admin, requiere Bearer) */
export async function listarContratos(): Promise<Contrato[]> {
  return normLista(await api('/api/contratos', { headers: { ...authHeader() } }))
}

/** POST /api/contratos — crea + envía el link por email. */
export async function crearContrato(nuevo: NuevoContrato): Promise<{ contrato: Contrato; emailFallo: string | null }> {
  const datos: Record<string, unknown> = {
    razon_social: nuevo.razonSocial,
    tipo: 'mensual' as const,
    razonSocial: nuevo.razonSocial,
    cuit: nuevo.cuit,
    email: nuevo.email,
    plan: nuevo.plan,
    precio: nuevo.precio,
    fecha: new Date().toISOString().slice(0, 10),
  }
  if (nuevo.domicilio) datos.domicilio = nuevo.domicilio
  const res = await fetch(`${API}/api/contratos`, {
    method: 'POST', headers: { ...JSON_HEADERS, ...authHeader() },
    body: JSON.stringify({
      datos,
      duenio_id: nuevo.duenioId ?? null,
      duenioId: nuevo.duenioId ?? undefined,
      tipo: 'mensual' as const,
      razonSocial: nuevo.razonSocial,
      cuit: nuevo.cuit,
      email: nuevo.email,
      plan: nuevo.plan,
      precio: nuevo.precio,
    }),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok && data?.id == null) {
    const msg = data?.error ?? data?.message
    throw new Error(typeof msg === 'string' ? msg : `Error del servidor (${res.status})`)
  }
  const contrato = normUno(data)
  if (data?.ok === false && contrato.estado === 'enviado') contrato.estado = 'borrador'
  if (!contrato.token) {
    try {
      const lista = await listarContratos()
      const found = lista.find(c => String(c.id) === String(contrato.id)) ?? lista.find(c => c.email === contrato.email)
      if (found?.token) contrato.token = found.token
      if (found?.link) contrato.link = found.link
    } catch { /* sin token — el admin lo recupera refrescando */ }
  }
  const emailFallo = res.ok ? null
    : (typeof data?.error === 'string' ? data.error : 'el email con el link falló')
  return { contrato, emailFallo }
}

/** GET /api/paquete?contrato_id= → JSON probatorio (admin — Bearer) */
export async function getPaquete(contratoId: number | string): Promise<unknown> {
  const id = encodeURIComponent(String(contratoId))
  const init: RequestInit = { headers: { ...authHeader() } }
  try {
    return await api(`/api/paquete?contrato_id=${id}`, init)
  } catch (e) {
    if (!(e instanceof Error) || !/404|no encontr/i.test(e.message)) throw e
    return api(`/api/contratos-paquete?contrato_id=${id}`, init)
  }
}
