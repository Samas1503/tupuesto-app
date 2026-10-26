import { neon } from '@neondatabase/serverless'

/** GET /api/fundadores → cupos del plan fundador en tiempo real */
export default async function handler(req, res) {
  const sql = neon(process.env.DATABASE_URL)
  const tomados = await sql.query(
    "SELECT count(*) c FROM usuarios WHERE plan = 'fundador' AND activo = true AND eliminado = false",
  )
  const cupos = 5
  res.json({ cupos, tomados: Number(tomados[0].c), quedan: Math.max(0, cupos - Number(tomados[0].c)) })
}
