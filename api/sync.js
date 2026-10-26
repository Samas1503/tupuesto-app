// POSTGRES/NEON sync endpoint — Dexie (IndexedDB) ↔ Neon
// GET  /api/sync  → pull: todas las tablas como JSON (requiere Bearer token)
// POST /api/sync  → push: upserts { tabla, rows[] } (requiere Bearer token)
// POST {accion:'login', email, pin} → sesión: {usuario, token}
import { neon } from '@neondatabase/serverless'
import crypto from 'node:crypto'
import { signToken, authOf } from './_lib/auth.js'

const TABLAS = {
  usuarios:    ['rol', 'nombre', 'email', 'pin_hash', 'debe_cambiar_pin', 'activo', 'eliminado', 'duenio_id', 'categoria', 'plan'],
  puestos:     ['duenio_id', 'nombre', 'ubicacion', 'activo'],
  productos:   ['duenio_id', 'nombre', 'precio', 'precio_costo', 'ingredientes', 'imagen', 'orden', 'activo'],
  jornadas:    ['duenio_id', 'puesto_id', 'vendedor_id', 'fecha', 'despacho', 'reposiciones', 'saldo_inicial', 'descarte', 'fondo_caja', 'hora_fin', 'cierre_anticipado_ok', 'estado', 'cierre', 'confirmada_at', 'created_at'],
  ventas:      ['jornada_id', 'items', 'total', 'metodo_pago', 'created_at'],
  solicitudes: ['duenio_id', 'tipo', 'vendedor_id', 'solicitado_por', 'jornada_id', 'motivo', 'estado', 'created_at', 'resuelta_at'],
  notificaciones: ['usuario_id', 'tipo', 'titulo', 'descripcion', 'leida', 'created_at'],
}
const JSONB = {
  jornadas: new Set(['despacho', 'reposiciones', 'saldo_inicial', 'descarte', 'cierre']),
  ventas: new Set(['items']),
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL no configurada' })

  const sql = neon(process.env.DATABASE_URL)

  // ── login server-side: email + PIN → token firmado ──
  if (req.method === 'POST' && req.body?.accion === 'login') {
    const email = String(req.body.email ?? '').trim().toLowerCase()
    const pin = String(req.body.pin ?? '').trim()
    if (!email || !pin) return res.status(400).json({ error: 'email y pin requeridos' })
    const rows = await sql.query(
      'SELECT * FROM usuarios WHERE lower(email) = $1 AND activo = true AND (eliminado IS NULL OR eliminado = false) LIMIT 1',
      [email],
    )
    const u = rows[0]
    const pinHash = crypto.createHash('sha256').update(pin, 'utf8').digest('hex')
    // usuarios sin pin todavía (alta vieja) — se les pide PIN nuevo por reset
    if (!u || u.pin_hash !== pinHash) return res.status(401).json({ error: 'Email o PIN incorrectos' })
    return res.json({
      token: signToken(u),
      usuario: {
        id: Number(u.id), rol: u.rol, nombre: u.nombre, email: u.email,
        debeCambiarPin: u.debe_cambiar_pin, duenioId: u.duenio_id, categoria: u.categoria, plan: u.plan,
        pinHash: u.pin_hash, // para verificar offline después — solo la propia
      },
    })
  }

  // pull + push requieren sesión válida
  const sesion = authOf(req)
  if (!sesion) return res.status(401).json({ error: 'no autorizado' })

  if (req.method === 'GET') {
    const out = {}
    for (const t of Object.keys(TABLAS)) out[t] = await sql.query(`SELECT * FROM ${t}`)
    // pin_hash nunca baja al cliente — la verificación es server-side
    out.usuarios = out.usuarios.map(u => { const { pin_hash, ...rest } = u; return rest })
    return res.json(out)
  }

  if (req.method === 'POST') {
    const { tabla, rows } = req.body ?? {}
    const allowed = TABLAS[tabla]
    if (!allowed || !Array.isArray(rows)) return res.status(400).json({ error: 'tabla/rows inválidos' })
    let n = 0
    for (const row of rows) {
      const cols = Object.keys(row).filter(k => k === 'id' ? true : allowed.includes(k))
      if (!row.id) return res.status(400).json({ error: 'cada row necesita id' })
      const vals = cols.map(c => {
        const v = row[c]
        return JSONB[tabla]?.has(c) && v != null ? JSON.stringify(v) : v
      })
      const sets = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')
      await sql.query(
        `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')})
         ON CONFLICT (id) DO UPDATE SET ${sets}`,
        vals,
      )
      n++
    }
    return res.json({ ok: true, upserted: n })
  }
  res.status(405).end()
}
