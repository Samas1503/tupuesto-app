**TuPuesto** · Credenciales de la demo

> Usuarios del seed (`db.ts` + `scripts/gen-sqlite.mjs`). Son datos de
> demostración — no plata ni identidades reales. En producción los PIN salen
> por email (`api/send-pin`) y el dueño nunca los ve.

## Vendedores

| Email | PIN | Rol en la demo |
|---|---|---|
| `marcos@demo.tupuesto` | `1234` | Feria Central · cierra OK |
| `alejandra@demo.tupuesto` | `2345` | Plaza Italia · faltante $16.400 + merma |
| `diego@demo.tupuesto` | `3456` | Costanera · turno abierto con reposición |

**Login:** MiDia pide email + PIN (primer ingreso con `debeCambiarPin`
fuerza elegir PIN propio).

## Dueño / admin

Sin credencial — el rol se alterna con el toggle Dueño/Vendedor (mecanismo
de demo; la auth por rol espera al backend, ADR-001).

## Regenerar / cambiar

- Editá el array `vendedores` en `app/src/db.ts` (seed) **y** en
  `app/scripts/gen-sqlite.mjs` (demo estática), luego
  `node scripts/gen-sqlite.mjs` para regenerar `public/tupuesto.sqlite`.
- Los `bulkPut` del seed usan el nombre como llave — si cambiás el nombre
  en una DB ya poblada, el backfill crea duplicado (borrar IndexedDB para
  resetear la demo: DevTools → Application → IndexedDB → `tupuesto`).
