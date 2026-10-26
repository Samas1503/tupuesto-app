# Backend — Neon Postgres + api/sync

El producto es **internet requerido + tiempo real**: el dueño ve los cierres de los
vendedores en vivo. Dexie/IndexedDB queda como cache/offline tolerance, no como
fuente de verdad final.

## Esquema Neon

`usuarios`, `puestos`, `productos`, `jornadas`, `ventas`, `solicitudes`, `codigos_reset`
— snake_case, JSONB en `jornadas.despacho/reposiciones/saldo_inicial/descarte/cierre`
y `ventas.items`. `usuarios.duenio_id` modela la dependencia vendedor→dueño.

Creado con `app/scripts/migrate-usuarios.mjs` (idempotente, corre `node` directo
con `DATABASE_URL` del `.env` raíz).

## API (Vercel serverless, proyecto `tupuesto` / landing)

| Endpoint | Qué |
|---|---|
| `GET /api/sync` | pull — todas las tablas como JSON |
| `POST /api/sync` | push — `{tabla, rows}` upsert por `id`, whitelist de columnas por tabla |
| `POST /api/request-reset` | `{email}` → código 6 dígitos por Resend (tabla `codigos_reset`, expira 15min) |
| `POST /api/verify-reset` | `{email, codigo, nuevoPin}` → hashea PIN y lo escribe |
| `POST /api/send-pin` | email de acceso inicial (template branded por categoría) |
| `api/email-template.js` | helper compartido — header navy + accent por categoría |

## Sync en la app (`lib/sync.ts` + `lib/snake.ts`)

- `syncPull()` — merge real: `put` por cada fila remota (la remota gana, last-write-wins)
- `startSyncLoop()` — pull al boot + cada 30s (`main.tsx`)
- `pushRow(tabla, id)` — relee la fila de Dexie y la pushea completa (fire-and-forget,
  nunca bloquea UI ni rompe offline)
- `toSnake(obj)`/`camel(row)` — mapeo de columnas; Postgres devuelve `bigint` como
  string → los timestamps se convierten a `Number`

## Env vars (Vercel `tupuesto`)

`DATABASE_URL`, `RESEND_API_KEY`, `FROM_EMAIL`, `MP_ACCESS_TOKEN`, `BASE_URL`, `NOTIFY_URL`.

## Limitaciones conocidas

- Sin propagación de deletes remotos (solo upsert)
- Sin auth de sesión real — PIN + email plano (el JWT/refresh va en una iteración posterior)
- `duenio_id` en `jornadas` puede ser null en filas viejas (scoping vía vendedor)

## Sync — semántica "remota gana"

- `syncPull` cada 30s: la remota es la fuente de verdad — upsert por id + **borra lo local que no está en Neon** (huérfanos).
- `pushRow` sube la fila a Neon tras cada escritura local.
- **Sesión demo** (`@demo.tupuesto`): salta `pushRow` y `syncPull` — la demo vive 100% en IndexedDB y no toca Neon.
- `seedDemoAccesos()` re-siembra los accesos demo en local si el pull los borró (login con email @demo.tupuesto).
