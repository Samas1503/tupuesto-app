**TuPuesto** · Registro de decisiones

---

## ADR-001 · Estrategia de entrada: SaaS validado por gates

| | |
|---|---|
| **Estado** | `LOCKED` |
| **Fecha** | 2026-10-21 |
| **Origen** | Debate estructurado, 4 stances × 3 rondas — `.context/work/tupuesto-saas/debate/` |
| **Modificada** | Piloto 90 → **45 días** (decisión del fundador) |

### Contexto

Micro-pyme de venta ambulante con más de un puesto: el dueño delega a vendedores
que arrancan el día con fondo de caja y rinden cuentas a la noche. Producto
propio de panadería + reventa. La pregunta era si el status quo (cuaderno +
WhatsApp) se puede cobrar con un SaaS de suscripción en Argentina.

La evidencia del debate: Treinta quemó USD 63M para probar que la micro-pyme
no paga por "registrar sus ventas" — pero La Cajita cobra $9.600–16.000/mes por
*control sobre empleados*. El producto no es un POS: es un anti-faltante.

### Decisión

**Construir, pero con dos gates antes de escalar. No se codea nada hasta que
alguien pague.**

```
GATE 0 · Preventa (2–3 semanas, sin build)
   ≥10–15 dueños multi-puesto pagan seña ~ARS 13.000 (reembolsable)
   └── NO convierte → no construir. Aprendiste por el precio de una landing.

GATE 1 · Piloto 45 días (build del wedge, 6–8 semanas)
   Solo si Gate 0 superado. Métricas de vida/muerte:
     ≥60% de puestos cerrando arqueo diario al día 30
     ≥15% conversión a pago
   └── debajo → se devuelven señas y se corta.
```

### El wedge (único alcance autorizado)

- Arqueo por conteo físico al cierre: `fondo + (despacho − remanente − merma)`
  — **el dueño carga** lo que sale; el vendedor solo cuenta físico.
- Efectivo y QR separados **por destino de cuenta** (alias del negocio vs.
  del vendedor). QR se declara, no se integra.
- QR del negocio como default; alias del vendedor = "modo confianza" flaggeado.
- Merma acotada: unidades + físico que vuelve + comparación entre puestos.
- Fondo fijo por vendedor; confirmación del dueño cierra la rendición.
- Offline-first, celular del vendedor, libreta privada — cero lenguaje fiscal.
- Promedio móvil 4 semanas (cae gratis del arqueo).

### Fuera del MVP (no discutir, está lockeado)

Proyecciones · proveedores · integración API Mercado Pago · facturación/ARCA ·
merma valuada · recetas/costos · freemium.

### Pricing

~ARS 12.900–14.900/mes por negocio (hasta 3 puestos) + ARS 3.000/puesto extra.
Playbook de prepago anual si el churn mensual aprieta. Ancla de venta:
*"menos que un faltante"*.

### Consecuencias

- Techo asumido: nicho rentable ~USD 10–30k MRR. **No** es venture-scale.
- CAC ≈ 0 obligatorio: ferias, WhatsApp, asociaciones de feriantes, panaderos
  que abastecen puestos.
- El diseño depende de que el despacho lo cargue el dueño — si eso falla en
  campo, todo el arqueo pierde el ancla.

### Reapertura

Reabrir si: >90% de cobros QR ya caen a cuenta del dueño · La Cajita u otro
agrega rendición móvil · el multi-puesto resulta abrumadoramente familiar ·
los gates se superan holgadamente (→ roadmap D: QR a cuenta del dueño vía
partnership/fee).

---
<sub>ADR-001 · las decisiones locked solo se reabren con evidencia, no con opinión.</sub>
