// POSTGRES/NEON sync endpoint — Dexie (IndexedDB) ↔ Neon
// GET  /api/sync  → pull: todas las tablas como JSON (requiere Bearer token)
// POST /api/sync  → push: upserts { tabla, rows[] } (requiere Bearer token)
// POST {accion:'login', email, pin} → sesión: {usuario, token}
import { neon } from '@neondatabase/serverless'
import crypto from 'node:crypto'
import { signToken, authOf } from './_lib/auth.js'
import { applyCors } from './_lib/cors.js'
import { verifyPin, hashPin as hashPinScrypt } from './_lib/pin.js'

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
  if (applyCors(req, res, 'GET, POST, OPTIONS')) return
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
    if (!u) return res.status(401).json({ error: 'Email o PIN incorrectos' })
    const v = verifyPin(pin, u.pin_hash)
    if (!v.ok) return res.status(401).json({ error: 'Email o PIN incorrectos' })
    if (v.upgrade) { // sha256 → scrypt transparente en el login
      await sql.query('UPDATE usuarios SET pin_hash = $1 WHERE id = $2', [hashPinScrypt(pin), u.id]).catch(() => {})
    }
    return res.json({
      token: signToken(u),
      usuario: {
        id: Number(u.id), rol: u.rol, nombre: u.nombre, email: u.email,
        debeCambiarPin: u.debe_cambiar_pin, duenioId: u.duenio_id, categoria: u.categoria, plan: u.plan,
      },
    })
  }

  // pull + push requieren sesión válida
  const sesion = authOf(req)
  if (!sesion) return res.status(401).json({ error: 'no autorizado' })

  if (req.method === 'GET') {
    // scoping por sesión — cada rol solo baja datos de su tenant
    const isAdmin = sesion.rol === 'admin'
    const tenant = sesion.rol === 'duenio' ? sesion.id : sesion.duenioId
    let queries
    if (isAdmin) {
      queries = Object.fromEntries(Object.keys(TABLAS).map(t => [t, [`SELECT * FROM ${t}`]]))
    } else if (tenant != null) {
      // dueño (tenant = su propio id) o vendedor (tenant = el id de su dueño)
      const p = [tenant]
      queries = {
        usuarios:    ['SELECT * FROM usuarios WHERE id = $1 OR duenio_id = $1', p],
        puestos:     ['SELECT * FROM puestos WHERE duenio_id = $1 OR duenio_id IS NULL', p],
        productos:   ['SELECT * FROM productos WHERE duenio_id = $1 OR duenio_id IS NULL', p],
        jornadas:    ['SELECT * FROM jornadas WHERE duenio_id = $1 OR duenio_id IS NULL', p],
        ventas:      ['SELECT * FROM ventas WHERE jornada_id IN (SELECT id FROM jornadas WHERE duenio_id = $1)', p],
        solicitudes: ['SELECT * FROM solicitudes WHERE duenio_id = $1 OR duenio_id IS NULL', p],
        notificaciones: ['SELECT * FROM notificaciones WHERE usuario_id = $1 OR usuario_id IN (SELECT id FROM usuarios WHERE duenio_id = $1)', p],
      }
    } else {
      // vendedor sin dueño asignado — solo lo estrictamente propio
      const p = [sesion.id]
      queries = {
        usuarios:    ['SELECT * FROM usuarios WHERE id = $1', p],
        puestos:     ['SELECT * FROM puestos WHERE 1 = 0'],
        productos:   ['SELECT * FROM productos WHERE 1 = 0'],
        jornadas:    ['SELECT * FROM jornadas WHERE vendedor_id = $1', p],
        ventas:      ['SELECT * FROM ventas WHERE 1 = 0'],
        solicitudes: ['SELECT * FROM solicitudes WHERE 1 = 0'],
        notificaciones: ['SELECT * FROM notificaciones WHERE usuario_id = $1', p],
      }
    }
    const out = {}
    for (const t of Object.keys(TABLAS)) {
      const [q, params] = queries[t]
      out[t] = await sql.query(q, params)
    }
    // pin_hash nunca baja al cliente — la verificación es server-side (tampoco para admin)
    out.usuarios = out.usuarios.map(u => { const { pin_hash, ...rest } = u; return rest })
    return res.json(out)
  }

  if (req.method === 'POST') {
    const { tabla, rows } = req.body ?? {}
    const allowed = TABLAS[tabla]
    if (!allowed || !Array.isArray(rows)) return res.status(400).json({ error: 'tabla/rows inválidos' })
    const isAdmin = sesion.rol === 'admin'
    const tenant = sesion.rol === 'duenio' ? sesion.id : sesion.duenioId
    let n = 0
    for (const row of rows) {
      if (!row.id) return res.status(400).json({ error: 'cada row necesita id' })

      // ownership — admin escribe todo; el resto solo dentro de su tenant
      if (!isAdmin) {
        if (tabla === 'usuarios') {
          // solo su propia fila y solo pin_hash/debe_cambiar_pin (flujo elegirPIN)
          if (Number(row.id) !== sesion.id) {
            return res.status(403).json({ error: 'solo podés modificar tu propio usuario' })
          }
          const prohibidas = Object.keys(row).filter(k => !['id', 'pin_hash', 'debe_cambiar_pin'].includes(k))
          if (prohibidas.length) {
            return res.status(403).json({ error: `columnas no permitidas: ${prohibidas.join(', ')}` })
          }
        } else if (tabla === 'notificaciones') {
          // usuario_id propio o de un usuario del mismo tenant
          if (row.usuario_id == null) return res.status(400).json({ error: 'notificaciones requiere usuario_id' })
          if (Number(row.usuario_id) !== sesion.id) {
            const dest = await sql.query('SELECT duenio_id FROM usuarios WHERE id = $1', [row.usuario_id])
            if (tenant == null || !dest[0] || Number(dest[0].duenio_id) !== tenant) {
              return res.status(403).json({ error: 'notificación fuera de tu cuenta' })
            }
          }
        } else if (tabla === 'ventas') {
          // ventas no tiene duenio_id — se valida por la jornada a la que pertenece
          if (row.jornada_id == null) return res.status(400).json({ error: 'ventas requiere jornada_id' })
          const j = await sql.query('SELECT duenio_id, vendedor_id FROM jornadas WHERE id = $1', [row.jornada_id])
          const ok = j[0] && (tenant != null
            ? Number(j[0].duenio_id) === tenant
            : Number(j[0].vendedor_id) === sesion.id)
          if (!ok) return res.status(403).json({ error: 'jornada fuera de tu cuenta' })
        } else {
          // tablas con duenio_id: debe ser el tenant de la sesión; si falta, se setea
          if (row.duenio_id != null && Number(row.duenio_id) !== tenant) {
            return res.status(403).json({ error: 'duenio_id no corresponde a tu cuenta' })
          }
          if (row.duenio_id == null) row.duenio_id = tenant
        }
      }

      const cols = Object.keys(row).filter(k => k === 'id' ? true : allowed.includes(k))
      const vals = cols.map(c => {
        const v = row[c]
        return JSONB[tabla]?.has(c) && v != null ? JSON.stringify(v) : v
      })
      const updates = cols.filter(c => c !== 'id')
      // si solo viene el id no hay nada que actualizar — DO NOTHING evita SQL inválido
      const onConflict = updates.length
        ? `DO UPDATE SET ${updates.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
        : 'DO NOTHING'
      await sql.query(
        `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')})
         ON CONFLICT (id) ${onConflict}`,
        vals,
      )
      n++
    }
    return res.json({ ok: true, upserted: n })
  }
  res.status(405).end()
}
