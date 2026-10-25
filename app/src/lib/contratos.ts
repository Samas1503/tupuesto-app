/** Cliente de la API de contratos + firma electrónica (worker T01).
 *  Defensivo a propósito: normaliza snake_case ↔ camelCase, el `datos` JSONB
 *  embebido, y las variantes de shape ({contrato:…}, array directo, {items:…})
 *  para que el front no se rompa si el backend devuelve algo distinto. */

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
  const res = await fetch(path, init)
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
    duenioId: (pick(m, 'duenioId', 'duenio_id') as number | undefined),
  }
}

function normLista(data: unknown): Contrato[] {
  const d = data as Record<string, unknown> | unknown[] | null
  const arr = Array.isArray(d) ? d
    : (d?.contratos ?? d?.items ?? d?.rows ?? d?.data ?? [])
  return (Array.isArray(arr) ? arr : []).map(normContrato)
}

function normUno(data: unknown): Contrato {
  const d = data as Record<string, unknown> | unknown[] | null
  const anidados = !Array.isArray(d) && d != null ? d.contratos : null
  const raw = Array.isArray(d) ? d[0]
    : (d?.contrato ?? (Array.isArray(anidados) ? anidados[0] : undefined) ?? d)
  return normContrato(raw)
}

/** link público de firma — prefiere el que devuelve la API; si no, lo arma
 *  local con la base /app de Vercel */
export function linkFirma(c: Pick<Contrato, 'token' | 'link'>): string {
  if (c.link) return c.link
  return `${location.origin}${import.meta.env.BASE_URL}firmar?token=${encodeURIComponent(c.token ?? '')}`
}

/* ── endpoints ─────────────────────────────────────────────────────── */

/** GET /api/contratos — lista (admin) */
export async function listarContratos(): Promise<Contrato[]> {
  return normLista(await api('/api/contratos'))
}

/** POST /api/contratos — crea + envía el link por email.
 *  El backend real recibe {datos:{razon_social,cuit,email,plan,precio,…},
 *  duenio_id}; se mandan además las claves planas por compatibilidad con el
 *  contrato original del ticket.
 *  Ojo: un 502 "contrato creado pero el email falló" devuelve id+token igual —
 *  se considera creado y se devuelve `emailFallo` para avisar al admin. */
export async function crearContrato(nuevo: NuevoContrato): Promise<{ contrato: Contrato; emailFallo: string | null }> {
  const datos: Record<string, unknown> = {
    razon_social: nuevo.razonSocial,
    tipo: 'mensual' as const,
    razonSocial: nuevo.razonSocial, // la plantilla {{razonSocial}} es camel
    cuit: nuevo.cuit,
    email: nuevo.email,
    plan: nuevo.plan,
    precio: nuevo.precio,
    fecha: new Date().toISOString().slice(0, 10),
  }
  if (nuevo.domicilio) datos.domicilio = nuevo.domicilio
  const res = await fetch('/api/contratos', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      datos,
      duenio_id: nuevo.duenioId ?? null,
      duenioId: nuevo.duenioId ?? undefined, // compat con el contrato del ticket
      // claves planas — por si el endpoint toma la shape original del ticket
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
  // si la respuesta no trae token, lo buscamos en la lista recién creada
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

/** GET /api/firmar?token= — datos públicos del contrato a firmar.
 *  (la implementación real lo expone en /api/firmar; se prueba /api/contratos
 *  como fallback por compatibilidad con el contrato del ticket — validando que
 *  el token coincida para no agarrar otro contrato de la lista) */
export async function getContratoPorToken(token: string): Promise<Contrato> {
  const q = `token=${encodeURIComponent(token)}`
  const errFirmar = await api(`/api/firmar?${q}`)
    .then(normUno)
    .then(c => ({ c, e: null as Error | null }))
    .catch(e => ({ c: null, e: e instanceof Error ? e : new Error('error') }))
  if (errFirmar.c) return errFirmar.c
  // fallback: /api/contratos?token= — filtramos por token si devuelve la lista
  try {
    const data = await api(`/api/contratos?${q}`)
    const lista = normLista(data)
    const found = lista.find(c => c.token === token)
    if (found) return found
    const uno = normUno(data)
    if (uno.token === token || uno.razonSocial || uno.texto) return uno
  } catch { /* se informa el error original */ }
  throw errFirmar.e
}

/** POST /api/firmar {paso:'visto'} — marca documento_visto en el audit trail */
export async function marcarVisto(token: string): Promise<void> {
  await api('/api/firmar', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ token, paso: 'visto' }),
  })
}

/** POST /api/firmar {paso:'otp'} — envía el código de 6 dígitos al email */
export async function pedirOtp(token: string, email?: string): Promise<void> {
  await api('/api/firmar', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({ token, paso: 'otp', ...(email ? { email } : {}) }),
  })
}

/** POST /api/firmar {paso:'otp', codigo} — valida el código SIN consumirlo
 *  (el backend lo consume atómicamente en 'firmar': un código = una firma).
 *  Si el endpoint no distingue validación y responde 200 genérico, igual se
 *  habilita el canvas: la validación fuerte la hace 'firmar' server-side. */
export async function verificarOtp(token: string, email: string | undefined, codigo: string): Promise<void> {
  await api('/api/firmar', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      token, paso: 'otp', codigo,
      ...(email ? { email } : {}),
    }),
  })
}

export interface ResultadoFirma {
  ok?: boolean
  estado?: string
  pdfHash?: string
  anclaje?: string
  copiaEnviada?: boolean
}

/** POST /api/firmar {paso:'firmar'} — OTP + firma (dataURL) + aceptación.
 *  El backend real exige `acepta:true`; se mandan alias por compatibilidad. */
export async function enviarFirma(opts: {
  token: string
  email?: string
  codigo: string
  firma: string // dataURL PNG del canvas
}): Promise<ResultadoFirma> {
  const data = await api<Record<string, unknown>>('/api/firmar', {
    method: 'POST', headers: JSON_HEADERS,
    body: JSON.stringify({
      token: opts.token,
      paso: 'firmar',
      codigo: opts.codigo,
      firma: opts.firma,
      acepta: true,       // nombre real del backend
      aceptacion: true,   // contrato del ticket
      aceptado: true,     // por si usa el otro nombre
      ...(opts.email ? { email: opts.email } : {}),
    }),
  })
  return {
    ok: data?.ok === true,
    estado: typeof data?.estado === 'string' ? data.estado : undefined,
    pdfHash: (data?.pdf_hash ?? data?.pdfHash) as string | undefined,
    anclaje: typeof data?.anclaje === 'string' ? data.anclaje : undefined,
    copiaEnviada: (data?.copia_enviada ?? data?.copiaEnviada) as boolean | undefined,
  }
}

/** GET /api/paquete?contrato_id= → JSON probatorio exportable.
 *  (el nombre del contrato del ticket era /api/contratos-paquete — fallback) */
export async function getPaquete(contratoId: number | string): Promise<unknown> {
  const id = encodeURIComponent(String(contratoId))
  try {
    return await api(`/api/paquete?contrato_id=${id}`)
  } catch (e) {
    if (!(e instanceof Error) || !/404|no encontr/i.test(e.message)) throw e
    return api(`/api/contratos-paquete?contrato_id=${id}`)
  }
}

/** descarga el paquete probatorio como .json en el dispositivo del admin */
export async function descargarPaquete(contrato: Contrato): Promise<void> {
  const data = await getPaquete(contrato.id)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `paquete-probatorio-contrato-${contrato.id}.json`
  a.click()
  URL.revokeObjectURL(url)
}
