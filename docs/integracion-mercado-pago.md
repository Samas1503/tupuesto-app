**TuPuesto** · Guía — integración Mercado Pago del producto (roadmap D)

> La preventa tiene su propia guía (`preventa/mercado-pago.md`, link de señas).
> Esto es distinto: integrar MP **al producto** para que la corriente digital
> deje de ser *declarada* y pase a ser *verificada* por un raíl de terceros.
> **Está lockeada fuera del wedge** (ADR-001) hasta evidencia del piloto —
> se abre con la condición "QR a cuenta del dueño" del plan de reapertura.

---

## Por qué existe este roadmap

Del debate (stance domain): el wedge solo audita lo que el vendedor **no**
controla. En el MVP el QR se declara — funciona por la anomalía estadística,
pero el contador honesto tiene la misma pantalla que el ladrón. La integración
convierte el QR en un raíl verificable: lo que MP dice que entró vs. lo que el
vendedor declaró que cobró.

**El caso La Plata es el precedente**: el fraude se descubrió por datos de
Mercado Pago, no por self-reporting. Esto industrializa eso.

## Tres niveles — implementar en este orden

```
N1 · QR a cuenta del dueño (SIN API, sin backend)
     El puesto muestra el QR del dueño. El dinero nunca toca
     la cuenta del vendedor → el "modo confianza" desaparece.
     Verificación: manual (el dueño ve su saldo MP).

N2 · Verificación por API (OAuth Connect + lectura de pagos)
     El dueño linkea su MP una vez. La app lee los cobros reales
     del día y los cruza contra lo declarado en el cierre.
     → flag qrDeclaradoVsVerificado. El GIGO muere de verdad.

N3 · Marketplace con fee (monetización alternativa)
     TuPuesto cobra un % sobre cada pago (application_fee).
     Modelo del skeptic: suscripción + transaccional.
```

**Regla:** no saltarse N2. La monetización transaccional sin verificación es
cobrar por datos mentirosos.

## Pre-requisitos

- [ ] Backend decidido y deployado (el webhook y los tokens exigen servidor —
      la decisión de backend sigue pendiente, es la misma que habilita sync)
- [ ] App en `developers.mercadopago.com` → `APP_ID` + `SECRET` de producción
- [ ] Cuenta MP del negocio verificada (KYC completo del dueño)
- [ ] Usuarios de prueba MP para el sandbox (se crean en el dashboard)

## N1 — QR del dueño en el puesto (1–2 días, sin API)

Sin API: el dueño carga su alias/CBU una vez; la app renderiza el QR para que
el vendedor lo muestre al cliente. Cambios:

- `puesto.qrDestinoDefault = 'negocio'` ya existe — el default queda.
- Nueva config en `negocio`: `qrAlias` + imagen QR generada
  (librería `qrcode` client-side, no hace falta API de MP).
- En `MiDia`: botón "Mostrar QR de cobro" → pantalla grande con el QR del
  dueño para mostrar al cliente desde el celular del vendedor.
- Flag inmediata gratis: todo QR declarado con `destino='vendedor'` pasa a
  ser excepción que hay que justificar.

> Honestidad del dominio: el QR estático a CVU/alias es transferencia, no
> "pago MP". Funciona igual para el cliente (cualquier billetera lo lee) y
> es gratis para el negocio.

## N2 — Verificación real (OAuth Connect)

El dueño autoriza TuPuesto a **leer** sus cobros MP una sola vez. Después, el
arqueo cruza declarado vs. recibido.

### Flujo OAuth

```
1. App → GET https://auth.mercadopago.com/authorization
        ?client_id=APP_ID&response_type=code&platform_id=mp
        &state=<csrf>&redirect_uri=<tu-backend>/mp/callback
2. Dueño acepta → MP redirige con ?code=...
3. Backend → POST https://api.mercadopago.com/oauth/token
        { grant_type:"authorization_code", code, redirect_uri,
          client_secret: SECRET }
   ← { access_token, refresh_token, user_id }
4. Guardar tokens CIFRADOS en la tabla negocio.
   Refresh antes de ~180 días (mismo endpoint, grant_type=refresh_token).
```

### Lectura y cruce

- Webhook `/v1/payments` (mismo patrón que `api/mp-webhook.js` de la preventa)
  o polling: `GET /v1/payments/search?begin_date=...&end_date=...` con el
  access_token del dueño.
- Por jornada cerrada: `sum(pagos del día del puesto)` vs `cierre.qrTotal`.

### Cambios al modelo

```ts
negocio:  { mpUserId, mpAccessToken/*cifrado*/, mpRefreshToken, qrAlias }
pago:     { jornadaId, mpPaymentId, monto, fecha, medio }
jornada:  + qrVerificado: number   // total real cobrado según MP
```

**Nueva flag del arqueo** (`arqueo.ts` la mantiene — R13):

```ts
qrDeclaradoVsVerificado = cierre.qrTotal − jornada.qrVerificado
// <0: cobró y no declaró (fuga digital) · >0: declaró de más (raro)
```

### Seguridad (innegociable — plata de por medio)

- Tokens cifrados en reposo (AES-256, key en env del servidor).
- Validar firma del webhook: header `x-signature` (`ts` + `v1` hasheado con el
  webhook secret del dashboard MP) antes de procesar nada.
- El token del **vendedor nunca se pide** — solo el del dueño. Si un puesto
  cobra a cuenta del vendedor, no hay raíl verificable → queda "modo
  confianza" flaggeado, que es exactamente el comportamiento de hoy.

## N3 — Fee transaccional (después de verificación)

`application_fee` en las preferences avanzadas (marketplace): TuPuesto retiene
un % de cada pago y el resto cae al dueño. Requiere marketplace approval de
MP — tratarlo como decisión de modelo nueva, no como feature.

## Qué NO integrar

- Cobrar en nombre de los vendedores (toma el dinero a tu custodia —
  obligaciones fiscales/money-transmitter que el negocio no quiere).
- Reembolsos/chargebacks desde la app.
- Facturación electrónica — sigue siendo anti-término del dominio.

## Testing

- Dashboard MP → usuarios de prueba: creás un "vendedor MP" y un "comprador
  MP" de prueba; los pagos de prueba no mueven plata real.
- `sandbox_init_point` vs `init_point` en las preferences.
- Probar webhook apuntando el notification_url a un túnel (ngrok) en dev.

## Secuencia sugerida cuando se abra

1. Piloto confirma retención → se decide backend.
2. **N1**: QR del dueño en pantalla del vendedor (una semana, sin API).
3. **N2**: OAuth + lectura + flag de cruce (la que mata el GIGO).
4. **N3**: solo si el volumen y el modelo lo justifican — decisión aparte.

---
<sub>Roadmap D · la suscripción cobra por verificación; la integración es lo
que hace la verificación real.</sub>
