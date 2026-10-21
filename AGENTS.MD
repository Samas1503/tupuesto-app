**TuPuesto** · Manual para agentes

> Antes de tocar nada: 15 minutos de lectura ahorran un día de retrabajo.

---

## Leer primero

1. **RULES.MD** — R1–R14. Lo que no se negocia y *por qué*.
2. **decisions.md** — ADR-001 locked: gates, wedge, pricing, qué NO construir.
3. **GLOSARY.MD** — hablar el dominio. `jornada`, `despacho`, `remanente`,
   `merma`, `faltante`, `destino del QR`. Los sinónimos acá cuestan plata.
4. **DOCUMENTATION.MD** — arquitectura, modelo, la fórmula del arqueo.

## En 5 líneas

PWA local-first para dueños de venta ambulante multi-puesto (Argentina).
El dueño carga despacho + fondo; el vendedor cuenta físico al cierre; la app
dice esperado vs. contado con efectivo/QR separados. Anti-faltante, no POS.
Pre-MVP: Gate 0 en curso, wedge demo andando.

## DO / DON'T

| ✅ | ❌ |
|---|---|
| Importar la matemática de `lib/arqueo.ts` | Recalcular `despacho − remanente − merma` a mano en una vista |
| UI en "vos", frases cortas, botones grandes | Copy corporativo, pantallas densas de escritorio |
| `onPress`, compound components, sin provider | Patrones de HeroUI v2 (`HeroUIProvider`, `framer-motion`, props planos) |
| Pedir evidencia antes de agregar scope | Colar proyecciones/proveedores/MP-API/facturación porque "suma" |
| El vendedor solo escribe campos de `cierre` | Dejar que la UI del vendedor toque despacho o precios |
| `.context/` para scratch de trabajo | Referenciar `.context/` desde app, docs o commits |
| Avisar cuando una regla choca con un pedido | Obedecer el pedido y romper la regla en silencio |

## Convenciones rápidas

- Paleta: navy `#0a2540` · blurple `#635bff` · paper `#f6f9fc` · warn `#b84900`
  · wa `#25d366`. Números con clase `num`.
- Componente HeroUI nuevo → consultar skill `heroui-react` antes
  (`~/.config/devin/skills/heroui-react/scripts/get_component_docs.mjs`).
- Nombres de dominio exactos como en GLOSARY — en tipos, tablas y copy.
- Git: no commitear sin cambios, no pushear sin pedido, no tocar git config.

## Verificación

```bash
cd app
npx tsc -b        # limpio
npm run lint      # oxlint
npm run build     # build + PWA
npm run preview   # ← así se prueba offline (dev no tiene SW)
```

## Estado vs. pendiente

**Hecho:** wedge local-first completo — despacho, cierre por conteo, doble
corriente con destino, merma acotada, confirmación, precios, puestos,
historial 4 semanas.

**Pendiente y no decidido:** backend/sync multi-dispositivo, auth por rol,
tap-por-venta opcional, roadmap D. Cada uno requiere OK del humano —
no adelantarse.

---
<sub>El debate ya se hizo. Acá se ejecuta — y cuando toca decidir, se avisa.</sub>
