// Verifica el hash-chain de firma_eventos recomputando cada event_hash:
//
//   node app/scripts/verify-firma-chain.mjs            → todos los contratos
//   node app/scripts/verify-firma-chain.mjs 3          → solo contrato id=3
//
// Para cada evento: prev_hash debe ser el event_hash anterior (el primero es
// 64 ceros) y event_hash = SHA-256(`${prev_hash}|${tipo}|${stableJson(payload)}|${created_at}`).
// Exit 1 si alguna cadena está rota. DATABASE_URL del entorno o del .env raíz.

import { neon } from '@neondatabase/serverless'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const ENV_PATH = new URL('../../.env', import.meta.url)
function loadEnv() {
  if (!existsSync(ENV_PATH)) return
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const s = line.trim()
    if (!s || s.startsWith('#') || !s.includes('=')) continue
    const i = s.indexOf('=')
    const k = s.slice(0, i).trim()
    const v = s.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!(k in process.env)) process.env[k] = v
  }
}
loadEnv()
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL — configurarla en el .env raíz o exportarla.')
  process.exit(1)
}
const sql = neon(process.env.DATABASE_URL)

const GENESIS = '0'.repeat(64)
const sha256hex = (s) => createHash('sha256').update(s).digest('hex')
const stableJson = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']'
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}'
}

const arg = process.argv[2]
const where = arg != null ? 'WHERE contrato_id = $1' : ''
const params = arg != null ? [Number(arg)] : []
const eventos = await sql.query(
  `SELECT * FROM firma_eventos ${where} ORDER BY contrato_id, id`, params,
)

const porContrato = new Map()
for (const ev of eventos) {
  if (!porContrato.has(ev.contrato_id)) porContrato.set(ev.contrato_id, [])
  porContrato.get(ev.contrato_id).push(ev)
}

let ok = true
if (!porContrato.size) console.log('sin eventos' + (arg != null ? ` para contrato ${arg}` : ''))
for (const [cid, list] of porContrato) {
  let prev = GENESIS
  let valida = true
  for (const ev of list) {
    const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload
    const esperado = sha256hex(`${prev}|${ev.tipo}|${stableJson(payload)}|${ev.created_at}`)
    if (ev.prev_hash !== prev || ev.event_hash !== esperado) {
      valida = false
      console.error(`✗ contrato ${cid} evento #${ev.id} (${ev.tipo}): hash roto`)
      console.error(`  prev esperado ${prev.slice(0, 16)}… / en DB ${String(ev.prev_hash).slice(0, 16)}…`)
      console.error(`  hash esperado ${esperado.slice(0, 16)}… / en DB ${String(ev.event_hash).slice(0, 16)}…`)
    }
    prev = ev.event_hash
  }
  console.log(`${valida ? '✔' : '✗'} contrato ${cid}: ${list.length} eventos — cadena ${valida ? 'VÁLIDA' : 'ROTA'}`)
  ok &&= valida
}
process.exit(ok ? 0 : 1)
