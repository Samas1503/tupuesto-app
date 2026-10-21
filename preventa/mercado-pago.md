**TuPuesto** · Cobro de señas con Mercado Pago

> Dos caminos, se usan los dos: el **link manual** para arrancar hoy, y la
> **integración API** cuando la preventa crece o querés tracking automático.

---

## Camino 1 — Link manual (hoy)

1. App Mercado Pago → **Cobrar** → **Link de pago**
2. Monto fijo **$13.000**, descripción "Reserva fundador TuPuesto"
3. Te da un `mpago.la/xxxxx` → va en `MP_LINK` en `landing/index.html` (CONFIG)
4. Quién pagó se ve en el panel de MP por nombre — alcanza para 10–15 señas.

## Camino 2 — API (`/api/mp-preference` + `/api/mp-webhook`)

Genera un link **único por lead** y te avisa automáticamente quién pagó.

### Deploy (Vercel, gratis)

```bash
npm i -g vercel
vercel deploy --prod   # sirve landing/ + api/ juntos
```

### Variables de entorno (Vercel → Settings → Environment Variables)

| Var | Qué es |
|---|---|
| `MP_ACCESS_TOKEN` | Token de tu app en developers.mercadopago.com → **producción para cobros reales** (de prueba para testear). NUNCA en el repo ni en la landing. |
| `BASE_URL` | La URL pública del deploy, ej. `https://tupuesto.vercel.app` |
| `NOTIFY_URL` | Opcional. Adónde avisar cada seña pagada. Ver abajo. |

### Usar el link por lead

```bash
curl -X POST https://TUDOMINIO/api/mp-preference \
  -H "Content-Type: application/json" \
  -d '{"leadId":"lead-juan-perez","nombre":"Juan Pérez"}'
# → {"init_point":"https://mercadopago.com.ar/checkout/..."}
```

Ese `init_point` es el link único del lead — lo mandás por WhatsApp. El pago
lleva `external_reference: leadId`.

### Notificación por seña (`NOTIFY_URL`)

El webhook consulta el pago en MP, y si está aprobado dispara tu URL con
`%TEXTO%` reemplazado (GET) o un POST JSON. Opciones:

- **WhatsApp al fundador** (CallMeBot, gratis):
  `https://api.callmebot.com/whatsapp.php?phone=5493884558285&apikey=TU_KEY&text=%TEXTO%`
  (activás tu key mandando "I allow callmebot to send me messages" al bot).
- **Google Apps Script** atado a la planilla de leads → marcá `señó` automático.

### Probar el webhook

```bash
curl -X POST https://TUDOMINIO/api/mp-webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","data":{"id":"ID_DE_UN_PAGO"}}'
```

---
<sub>El token vive solo en variables de entorno del servidor. Si alguna vez
se filtra: revocarlo en developers.mercadopago.com y generar uno nuevo.</sub>
