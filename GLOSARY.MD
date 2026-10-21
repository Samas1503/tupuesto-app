**TuPuesto** · Glosario

> Las palabras del dominio. En código, UI y docs se dicen así — el sinónimo
> confunde, y la confusión en este producto es plata.

---

### Actores

**dueño / admin** — el que paga la suscripción. Tiene 2+ puestos y no está
en ninguno. Carga el despacho, toca los precios, confirma rendiciones.

**vendedor** — el empleado que atiende el puesto. Su celular es el terminal.
Al cierre cuenta lo físico; jamás declara ventas ni toca el despacho.

**ICP** — el dueño con 2+ puestos atendidos por otros. El vendedor solitario
que atiende su propio puesto **no es ICP**: no tiene a quién verificar.

### La jornada

**jornada** — la unidad de todo el sistema: puesto + vendedor + fecha.
Estados: `abierta` → `cerrada` → `confirmada`.

**fondo de caja / fondo fijo** — plata para cambio que el dueño entrega al
inicio. Vuelve adentro del efectivo contado al cierre.

**despacho / cargado** — la mercadería que sale a la calle esa mañana.
**La carga el dueño**: es el ancla de verdad del arqueo.

**remanente / devuelto** — lo que vuelve vendible a la noche.

**merma** — lo que no vuelve o vuelve invendible (roto, pasado). Se declara
en unidades. Única variable que el vendedor controla solo → se audita por
comparación cross-puesto, no por confianza.

**rendición / arqueo / cierre** — el acto diario: el vendedor cuenta físico
y presenta plata; el día lo cierra la confirmación del dueño.

### La plata

**esperado** — `fondo + Σ(despacho − remanente − merma) × precio`.
Lo que *debería* haber.

**contado** — `efectivo + qr` presentados. Lo que hay.

**diferencia** — contado − esperado. Negativo = **faltante**.
Positivo = **sobrante** (también se mira: un sobrante es un error o un precio
viejo).

**doble corriente** — efectivo y QR nunca se suman sin separar.

**destino del QR** — a qué cuenta cayó el cobro digital. `negocio` es el
default; `vendedor` activa el **modo confianza** (válido pero flaggeado).

**QR en cero** — el puesto que declara $0 digital donde todos cobran por QR.
Señal estadística, se contrasta con su propio promedio.

### El negocio

**wedge** — el ciclo de arqueo completo. Lo mínimo que alguien paga solo.

**seña** — ARS ~13.000 reembolsables que reservan lugar de fundador.
La seña es el test: sin seña, "me interesa" no cuenta.

**Gate 0** — ≥10–15 señas en 2–3 semanas. Debajo → no se construye.

**piloto** — 45 días de uso real. Vida o muerte: ≥60% puestos cerrando diario
al día 30, ≥15% conversión a pago.

**libreta privada** — el posicionamiento: tu cuaderno, pero no se puede
"dibujar" después. Herramienta del dueño, no fiscalizador.

### Anti-términos (no usar, espantan)

~~facturación~~ · ~~AFIP/ARCA~~ · ~~ventas registradas~~ · ~~punto de venta~~
· ~~POS~~. El segmento rechaza el registro *oficial*, no el registro.

---
<sub>Si una palabra no está acá, probablemente todavía no existe en el dominio.</sub>
