# Planes de suscripción — límites por plan

## Tiers

| Plan | $/mes | Puestos | Vendedores | Beneficios |
|---|---|---|---|---|
| Básico | 13.000 | 2 | 2 | rendición diaria, stats |
| Estándar | 25.000 | 5 | 5 | + contratos digitales, soporte |
| Premium | 45.000 | ∞ | ∞ | + reportes avanzados, onboarding |

## Implementación

- `usuarios.plan` (basico|estandar|premium) — default `basico`.
- `lib/planes.ts`: `PLANES`, `planDe()`, `permiteMas(plan, actual, tipo)` — cap en `Vendedores` y `Puestos`.
- Al exceder el límite: `alert` con "Límite del plan X: N vendedores/puestos".
- La landing muestra los 3 tiers en la sección `#precio`.
