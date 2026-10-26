# Autenticación y sesiones — TuPuesto

## Modelo

Token firmado server-side (HMAC-SHA256, estilo JWT liviano, sin dependencias). El PIN **nunca** se compara en el cliente.

## Flujo

1. `POST /api/sync {accion:'login', email, pin}` → el server verifica `pin_hash` (scrypt `salt:hash`, `api/_lib/pin.js`) → el server verifica `pin_hash` en Neon (scrypt con salt, `api/_lib/pin.js` — legacy sha256 migra transparente en el login) → devuelve `{token, usuario}`.
2. El cliente guarda `tp-token` en localStorage + `tp-login-at` para el TTL local.
3. Todas las llamadas a `/api/sync` (pull y push) llevan `Authorization: Bearer <token>` → 401 si falta o expira.
4. `pin_hash` **no viaja en el pull** — solo el login devuelve el propio (para verificar offline).

## TTL de sesión

| Rol | Duración |
|---|---|
| vendedor | 8 h |
| dueño | 16 h |
| admin | sin límite |

Mismo TTL en el token (`api/_lib/auth.js` → `TTL_MS`) y en la lectura local (`App.tsx` → `SESION_TTL`). Al expirar la sesión se limpia y vuelve al login.

## Archivos

- `api/_lib/auth.js` — `signToken`/`verifyToken`/`authOf` (HMAC + timingSafeEqual). Secret: env `AUTH_SECRET`.
- `lib/auth.ts` — `loginServer`, `token()`, `authHeader()`, `guardarToken`/`borrarToken`.
- `components/Login.tsx` — server-login para usuarios reales; `@demo.tupuesto` sigue 100% local; fallback offline contra Dexie.
- `App.tsx` — TTL al restaurar sesión; `limpiarSesionLS` borra `tp-token`.

## Qué NO es (límites honestos)

- No es JWT estándar (sin librería) — formato propio `base64url(payload).firma`, compatible conceptualmente.
- `AUTH_SECRET` y `MP_WEBHOOK_SECRET` ya están seteados en Vercel prod (el default solo aplica en dev local).
- Los endpoints públicos por diseño: `/api/firmar` (firma por token de contrato), `/api/contratos?cupos=1` (landing), `/api/request-reset`, `/api/verify-reset`, `/api/send-pin` (limitado a usuarios existentes), `/api/mp-*` (Mercado Pago).
- Admin-only ya enforced: `GET`/`POST` `/api/contratos`, `/api/paquete?contrato_id`, `anular` → `authOf` + `rol==='admin'`. `/api/send-pin` → Bearer de cualquier rol + whitelist de `appUrl`.
