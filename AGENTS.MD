**TuPuesto** · Manual para agentes

> Antes de tocar nada: 15 minutos de lectura ahorran un día de retrabajo.

---

## Leer primero

1. **RULES.MD** — R1–R14. Lo que no se negocia y *por qué*.
2. **decisions.md** — ADR-001 locked: gates, wedge, pricing, qué NO construir.
3. **GLOSARY.MD** — hablar el dominio. `jornada`, `despacho`, `remanente`,
   `merma`, `faltante`, `destino del QR`. Los sinónimos acá cuestan plata.
4. **docs/** — arquitectura, modelo de datos, arqueo, vistas, desarrollo (`docs/README.md` es el índice).

## En 5 líneas

PWA local-first para dueños de venta ambulante multi-puesto (Argentina).
El dueño despacha al puesto y arma el turno (vendedor+fondo); el vendedor
registra cada venta con método y cierra con un tap — la app calcula
remanente, cobrado y diferencia. Anti-faltante, no POS.
Pre-MVP: Gate 0 en curso, demo deployada en Vercel.

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

## Estado actual (oct 2025 — post-iteración)

**Flujo real nuevo:** despacho va al *puesto* solo (productos); el **turno** = vendedor + fondo + confirmación del despacho — se arma en Hoy (FAB `+`) o el vendedor lo toma en MiDia. Multi-turno por puesto/día permitido cuando el anterior cerró. **Cierre automático**: remanente = cargado − vendido registrado; sin conteo manual. El vendedor registra cada venta con método de pago (efectivo/QR/transf.) — conteo físico quedó como cruce opcional (`cruceCierre`).

**Modelo nuevo:** `Venta` (Dexie v3), `Solicitud` baja vendedor→admin (v4), `Jornada.reposiciones[]`, `Producto.precioCosto/imagen/ingredientes`, `Vendedor.pin/email/debeCambiarPin` (puestoId ahora preferencia, no vínculo). Índice `[fecha+vendedorId]` en v2.

**Vistas:** MiDia = login PIN + "Turnos sin asignar" + Vender (modal por producto) + cierre con nota. Hoy = tabs Turnos/Productos + barra "Cobrado hoy" vs. meta + FAB nuevo turno. Despacho = FAB + calendario colapsable + comprobante. Equipo = ABM + stats (horas, unidades, $/h). Estadísticas (ex Historial) = matriz puesto×día + timeline horario + productividad + gastos vs. pérdidas.

**Demo/deploy:** `scripts/gen-sqlite.mjs` genera `public/tupuesto.sqlite`; `cargarDesdeSqlite()` hidrata IndexedDB desde el archivo estático vía `sql.js` WASM → demo sin backend en Vercel. Dos proyectos: landing `tupuesto-app.vercel.app` (root, `vercel.json` → `landing/`, detecta `api/`) y app `app-ten-tan-35.vercel.app` (root dir `app/`). `DEMO_URL` en landing apunta a la app. Git connect pendiente en dashboard.
