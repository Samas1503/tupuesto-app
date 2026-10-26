**TuPuesto** · Desarrollo, seed y deploy

## Comandos (`app/`)

```bash
npm run dev       # dev (SIN service worker) · proxy /api → :3000
npm run build     # tsc -b && vite build
npm run preview   # dist/ con SW — así se prueba offline
npm run lint      # oxlint
npx vitest run    # tests de arqueo (35)
```

Local completo (con `api/`): `vercel dev` en la raíz + `npm run dev` en `app/`.
Env vars: `.env` raíz — `MP_ACCESS_TOKEN`, `RESEND_API_KEY`, `FROM_EMAIL`,
`BASE_URL`, `NOTIFY_URL`.

## Seed — `src/db.ts`

Determinista (mulberry32). Marcos/Feria Central cierra OK, Alejandra/Plaza
Italia con faltante $16.400 y merma 18u, Diego/Costanera abierto +
reposición y ventas registradas. 4 semanas históricas. `seedIfEmpty()`
intenta primero `cargarDesdeSqlite()` → fallback seed local; los backfills
cubren DBs viejas (imagen/ingredientes/pin/email).

## Demo estática (sqlite)

`node scripts/gen-sqlite.mjs` → `public/tupuesto.sqlite` (mismo seed).
La app lo hidrata vía `sql.js` WASM (`public/sql-wasm.wasm`) si IndexedDB
está vacía → demo en Vercel sin backend.

## Deploys Vercel (dos proyectos)

| Proyecto | Root | Sirve |
|---|---|---|
| `tupuesto-app.vercel.app` | `.` (`vercel.json` → `landing/`) | landing + `api/` + botón "▶ Demo" |
| `app-ten-tan-35.vercel.app` | `app/` | la PWA (Vite, estático) |

Git connect pendiente en dashboard (auto-deploy on-push).

## Camino a backend (pendiente — ADR-001 reapertura)

Sync mapea tablas 1:1 + auth por rol + `negocioId` por tabla.
`debeCambiarPin` + `email` ya esperan el envío real con token único —
`api/send-pin` es el punto de integración.

## Env vars del backend

- `AUTH_SECRET` — secreto para firmar tokens de sesión (`api/_lib/auth.js`). **Configurarlo en Vercel — el default es solo dev.**
- `DATABASE_URL`, `RESEND_API_KEY`, `FROM_EMAIL`, credenciales MP — en Vercel.

## Emails (Resend)

- Envío: `notificaciones@samas-server.com` (dominio verificado en Resend)
- Soporte: `soporte@samas-server.com` → Cloudflare Email Routing → Gmail
- DNS: `samas-server.com` en Cloudflare (zone `e2c2ce063b1a1667bc69aaf03c0c39f2`)
