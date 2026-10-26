# Usuarios — tabla unificada, roles y acceso

Desde la migración (`app/scripts/migrate-usuarios.mjs`) hay **una sola tabla `usuarios`**
(en Neon y en Dexie v9). Las viejas `duenios`/`vendedores` quedan solo como backup/migración.

## Esquema `usuarios`

| Campo | Tipo | Qué |
|---|---|---|
| `id` | serial | pk — las jornadas referencian `vendedor_id` aquí |
| `rol` | `'admin'\|'duenio'\|'vendedor'` | define vistas y acceso |
| `nombre`, `email` | | email es unique + login |
| `pin_hash` | sha256 hex | nunca el PIN en claro — se hashea cliente (Web Crypto) y server (api) |
| `debe_cambiar_pin` | bool | alta/reseteo → el próximo ingreso pide PIN nuevo |
| `activo`, `eliminado` | bool | eliminación lógica restaurable por admin |
| `duenio_id` | int? | solo vendedores — dependencia con su dueño (`usuarios.duenio_id → usuarios.id`) |
| `categoria` | `'comida'\|'postres'\|'ropa'\|'mercaderia'\|'juguetes'\|'otro'` | solo dueños — define el tema |
| `puesto_id` | int? | compat — puesto habitual del vendedor |

## Login unificado (`components/Login.tsx`)

Un solo form email+PIN detecta el rol por la fila de `usuarios`.
**Desde el hardening de auth**: el PIN lo verifica el **server** (`loginServer` → `/api/sync`), no el cliente. Solo la demo (`@demo.tupuesto`) sigue verificando local; hay fallback offline contra Dexie.
- compara `SHA-256(pin)` vs `pinHash` (`lib/pin.ts` → `hashPin`)
- `debeCambiarPin` → flujo "Elegí tu PIN" (4-8 dígitos) → `pin_hash` + `pushRow('usuarios')`
- sesión en `localStorage`: `tp-rol` + `tp-user-id`

## Vistas por rol

| rol | ve |
|---|---|
| `duenio` | tabs Hoy/Despacho/Precios/Puestos/Equipo/Stats — datos scoping por `duenioId` |
| `vendedor` | solo MiDia (turno, vender/boleta, cerrar, historial) |
| `admin` | solo Admin (dashboard — ver `admin.md`) |

## Reset de PIN por email

`components/ResetPin.tsx` (inline, no modal):
1. email → `POST /api/request-reset` `{email}` — código 6 dígitos al correo (Resend)
2. código + PIN nuevo → `POST /api/verify-reset` `{email, codigo, nuevoPin}` —
   valida ≤15min + no usado, escribe `pin_hash` (SHA-256 server-side) y marca usado
3. éxito → ya puede entrar

## Temas por categoría

`index.css` define `[data-tema]` con `--accent` por categoría; `App.tsx` setea
`document.documentElement.dataset.tema` al login (dueño → su categoría, vendedor/admin → `'otro'`).

| categoría | color |
|---|---|
| comida | naranja `#e07a2f` |
| postres | rosa `#e04f9f` |
| ropa | violeta `#8b5cf6` |
| mercaderia | cyan `#0ea5e9` |
| juguetes | ámbar `#f59e0b` |
| otro / admin | blurple `#635bff` |
