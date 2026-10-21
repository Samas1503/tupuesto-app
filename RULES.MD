**TuPuesto** · Reglas

> Esto no se negocia. Cada regla sale del debate de 4 stances
> (`.context/work/tupuesto-saas/debate/`) o de `decisions.md` (ADR-001, locked).
> Si una regla choca con un pedido nuevo → **decirlo antes de obedecer**.

---

## I · Producto

**R1 — Es un anti-faltante, no un POS.**
El que paga es el dueño que no está. El valor es verificar lo que el vendedor
declara — nada más.

> *Por qué:* La Cajita cobra $9.600–16.000/mes por control sobre empleados;
> los POS de mostrador compiten con el cuaderno gratis y pierden.

**R2 — La primitiva es el arqueo por conteo físico al cierre.**
El vendedor cuenta hechos físicos inspeccionables (lo que quedó, lo que se
mermó, la plata). Nunca "declara ventas", nunca hace tap por venta en la calle.

> *Por qué:* el tap en un semáforo es inviable y la venta declarada es la
> confesión del ladrón. El conteo es verificable por spot-check.

**R3 — Doble corriente, siempre con destino.**
Efectivo y QR se registran por separado, y el QR lleva `destino`:
`negocio` | `vendedor`. Sin destino, el esperado del arqueo es indefinido.

> *Por qué:* La Plata, sep-2025 — cajeras cobraban al alias personal,
> ~$7M desviados, detectado solo al cruzar datos. La fuga ya migró al QR.

**R4 — Merma acotada o nada.**
La merma se declara en unidades, con físico que vuelve y comparación entre
puestos. Merma de texto libre = agujero donde se declara el robo.

> *Por qué:* es la única variable que el vendedor controla del todo;
> el ladrón consistente sobrevive un día, no sobrevive un patrón.

**R5 — El dueño confirma la rendición.**
El cierre del vendedor no cierra el día. `cerrada` → `confirmada` es el OK
del que paga.

**R6 — Offline-first, libreta privada.**
Todo funciona sin señal en el celular del vendedor; sincroniza después.
Y nunca — en UI, copy o nombres — aparece facturación, AFIP ni ARCA.

> *Por qué:* 43–65% del segmento es informal. Lo repelente es el registro
> *oficial*, no el registro: ya fotografían el cuaderno por WhatsApp.

**R7 — "Modo confianza" se muestra, no se esconde.**
Si los QR de un puesto caen a cuenta del vendedor, queda flaggeado como
anomalía. Es configuración válida (familia), pero visible.

---

## II · Alcance (ADR-001, locked)

**R8 — Solo el wedge.** Fondo fijo · arqueo por conteo · doble corriente con
destino · merma acotada · confirmación · catálogo+precios · promedio 4 semanas.

**R9 — Lo que está afuera, está afuera.** Proyecciones, proveedores, API de
Mercado Pago, facturación, merma valuada, recetas, freemium. Reabrir requiere
las condiciones de reapertura del ADR, no ganas.

**R10 — Gates antes que código.** Sin ≥10–15 señas de ~$13.000 no hay build
real; sin ≥60% de cierres diarios al día 30 del piloto no hay continuación.

---

## III · Código

**R11 — Español rioplatense, mobile-first.**
"Vos", frases cortas, botones grandes — se usa en la calle, con guantes,
a contraluz. Números `tabular-nums`, plata en ARS enteros formato `es-AR`.

**R12 — Cada dato lo escribe su rol.** El dueño escribe `despacho`, `fondoCaja`
y precios. El vendedor solo escribe `cierre`. En UI, el despacho es read-only
para el vendedor — siempre.

**R13 — `arqueo.ts` es la única fuente de la fórmula.** Las vistas importan,
nunca recalculan a mano.

**R14 — Stack fijado:** React 19 · HeroUI **v3** (compound, `onPress`, sin
provider) · Tailwind **v4** · Dexie · vite-plugin-pwa. Paleta: navy `#0a2540`,
blurple `#635bff`, paper `#f6f9fc`, warn `#b84900`, wa `#25d366`. Nada nuevo
sin decisión explícita.

---

<sub>Si dudás entre cumplir una regla o cumplir un pedido: la regla gana
hasta que el humano la reabra.</sub>
