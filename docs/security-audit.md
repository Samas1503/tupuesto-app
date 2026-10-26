# Security Audit — run-1 (cloudflare/security-audit-skill)

Hallazgos resueltos en el hardening de esta ronda. Artefactos: `~/security-audit-skill/tupuesto-app/run-1/`.

## Resuelto — críticos

- **C1 pull sin tenant**: `api/sync.js` GET ahora filtra por `duenio_id` del token (admin ve todo; duenio/vendedor solo su tenant; vendedor sin dueño → solo lo suyo). `pin_hash` strippeado siempre.
- **C2 push sin ownership**: usuarios → solo fila propia y solo `pin_hash`/`debe_cambiar_pin` (admin puede todo); `duenio_id` forzado de la sesión (ajeno → 403); ventas validan la jornada del tenant; `DO NOTHING` si no hay sets.
- **C3 login bypass**: eliminado `!u.pinHash` del fallback offline — sin hash local no hay login. El fallback a Dexie solo corre en error de red, nunca en 401/4xx del server.
- **C4 syncPush sin auth**: `authHeader()` en `syncPush`; 401 → borra `tp-token` (re-login).
- **C5 contratos públicos**: `GET` lista / `POST` crear-anular requieren `rol==='admin'`; `/api/paquete?contrato_id` → admin (público solo `?token=`); `GET ?token=` y `?cupos=1` siguen públicos por diseño.

## Resuelto — altos/medios

- **A1 send-pin relay**: requiere Bearer; `appUrl` whitelist (`tupuesto.vercel.app`/`localhost`).
- **A2 AUTH_SECRET**: seteado en Vercel (default solo dev).
- **A3 PIN**: `crypto.getRandomValues` en Vendedores/Admin; scrypt `salt:hash` en `api/_lib/pin.js` — hecho.
- **A4 OTP brute force**: `intentos` en `codigos_reset` (quema a los 5), consumo atómico en verify-reset, invalidación de códigos previos en request-reset, cooldown 60s en reenvío de firma.
- **M3 IP forense**: `x-vercel-forwarded-for`/último XFF (no el primero spoofeable).
- **M4 hash-chain**: advisory lock por contrato + `UNIQUE(contrato_id,prev_hash)` + retry.
- **M5 MP webhook**: verificación `x-signature` (HMAC con `MP_WEBHOOK_SECRET` si existe) + idempotencia vía `mp_webhooks_procesados`.
- **M6 template**: `normDatos` whitelist (sin `proveedor*` del cliente); `\s+` colapsado en fallback; validación CUIT/precio.
- **M7 PNG bomb**: check de dimensiones del header (máx 4MP) antes de embed; OTP se consume DESPUÉS de generar el PDF.

## Pendiente documentado

- ~~`MP_WEBHOOK_SECRET`~~ — seteado en Vercel (webhook verifica `x-signature`).
- ~~scrypt PIN~~ — hecho en `api/_lib/pin.js` (`salt:hash`, legacy sha256 migra en login).
- Scoping del pull podría endurecerse más (datos derivados).
