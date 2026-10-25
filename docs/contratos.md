**TuPuesto** · Contratos y firma electrónica

Modelo legal de la suscripción: qué clase de firma usamos, qué cubre, qué no
cubre, y cuándo escalar a un proveedor externo. La plantilla vive en
`api/templates/contrato-v1.js`; el pipeline de firma (tablas, endpoints,
hash-chain, anclaje) es T01 — este doc es la referencia compartida.

## El modelo en una línea

**Firma electrónica simple** bajo Ley 25.506 art. 5º — **no** firma digital
certificada (arts. 6º–7º). Ningún proveedor de sobres tipo DocuSign/Signwell
es certificante licenciado en Argentina: cambiar de proveedor no cambia la
clase jurídica, solo el audit trail. Por eso la implementación es propia con
anclaje externo barato (OpenTimestamps), y el proveedor queda como tier de
escalación *ex ante* para contratos de alto monto.

## Qué cubre

| Pieza | Base | Qué aporta |
|---|---|---|
| Identidad declarada en el contrato | práctica | razón social + CUIT/DNI del suscriptor en el documento |
| Domicilio electrónico | art. 75 CPCCN | el email del suscriptor es domicilio constitutivo de notificaciones → convierte el OTP en prueba de canal |
| Consentimiento del medio | Ley 25.506 | cláusula expresa: el suscriptor acepta firmar por medio electrónico y se obliga a no desconocer la firma (encarece la mala fe en un desconocimiento) |
| OTP + copia por email | diseño | link único + código de un solo uso al email declarado; el PDF final viaja por Resend → copia timestamped en servidores de terceros |
| Integridad con fecha cierta | arts. 286–288, 317 CPCCN | SHA-256 del documento canónico + hash-chain append-only en `firma_eventos` + anclaje OTS del hash raíz → la fecha deja de ser "lo que dice nuestro servidor" |
| Cadena de custodia exportable | art. 287 CPCCN ("confiabilidad del procedimiento") | paquete probatorio (`/api/paquete`): PDF + texto renderizado + eventos + receipt OTS + instrucciones de verificación — el perito no necesita confiar en nosotros |

## Qué NO cubre (límites honestos)

- **No es firma digital certificada.** No hay presunción iuris et de iure de
  autoría ni eficacia ejecutiva propia. Ante desconocimiento, **la carga de
  acreditar validez es nuestra** (art. 5º in fine, post-Ley 27.446) — todo el
  audit trail existe para descargar esa carga por acumulación.
- **El trazo del canvas no prueba identidad**, solo intención. No hay
  validación biométrica (imposible en el stack: requiere ML forense + base de
  firmas registradas). La autoría se construye por acumulación: OTP + identidad
  declarada + IP/metadata + conducta posterior.
- **Sin anclaje externo, el log self-hosted es prueba de parte.** El hash-chain
  solo prueba consistencia interna; el `occurred_at` es nuestro reloj hasta que
  OTS lo sella. Si el anclaje falla se degrada (contrato válido, menos
  defendible) — nunca bloquea.
- **Los emails del suscriptor pueden no ser personales.** Si el mail de la
  cuenta lo lee todo el equipo, el OTP prueba canal, no persona. Escalación:
  segundo canal (WhatsApp/DNI) — pendiente.
- **Suscriptores = consumidores subiría el piso.** Si algún suscriptor encuadra
  en Ley 24.240, las cargas probatorias pueden invertirse y el estándar sube.
  Hoy el target es dueño pyme en carácter empresario.
- **El proveedor todavía no tiene personería en el texto.** La plantilla marca
  `[CUIT del titular — pendiente]` / `[domicilio legal del titular — pendiente]`
  hasta que exista inscripción fiscal real — completar `PROVEEDOR` en
  `contrato-v1.js` o pasar `proveedor*` en `datos` antes de uso productivo.

## Disclaimers para el UI (texto exacto)

Pantalla de firma — bajo el botón Firmar y/o junto al canvas. Exportados como
`DISCLAIMER_FIRMA` y `DISCLAIMER_CANVAS` desde la plantilla para no divergir:

> Esta firma tiene validez de firma electrónica simple (Ley 25.506). El contrato y su evidencia quedan registrados con timestamp anclado y se envían por email.

> Firma capturada con consentimiento — documento con validez electrónica (Ley 25.506 art. 5º). No es firma digital certificada.

Nunca prometer: "firma digital", "validez plena equivalente a firma ológrafa",
"certificada". La clase correcta siempre es **electrónica simple**.

## La plantilla (`api/templates/contrato-v1.js`)

`generarContrato(datos)` → texto canónico UTF-8 determinístico: mismo input →
mismo output → mismo SHA-256. Sin `Date.now`/random — la fecha es un dato
(`datos.fecha`, formato libre pero estable, p.ej. `AAAA-MM-DD`).

- Requeridos: `razonSocial`, `cuit`, `email`, `domicilio`, `plan`, `precio`,
  `fecha` — falta alguno → `throw`, nunca se emite texto con `{{}}` suelto.
- Opcionales (datos del proveedor, con defaults de `PROVEEDOR`):
  `proveedorRazonSocial`, `proveedorCuit`, `proveedorDomicilio`,
  `proveedorEmail`.
- Sanitización: cada valor se normaliza (`trim` + colapso de espacios/saltos a
  uno) — un dato con `\n` no puede inyectar líneas falsas en el texto legal.
- El SHA-256 se computa sobre los bytes del texto renderizado (T01 guarda
  `plantilla_version` + hash en `contratos`; guardar también el texto
  renderizado, no solo el hash — la versión de plantilla archivada es parte de
  la prueba).
- Cláusulas cubiertas: objeto SaaS, multi-tenant, plan/precio/facturación
  (aviso 30 días), permanencia (**sin mínima**, cancelable cuando quiera —
  consistente con `landing/terminos.html`), medio electrónico + firma
  electrónica simple, validación OTP + copia, domicilio electrónico art. 75,
  integridad por hash, datos personales Ley 25.326, jurisdicción.

## Cuándo escalar a proveedor externo (decisión ex ante)

La rama se decide **al generar el contrato**, nunca después — no existe upgrade
retroactivo de un documento ya firmado (habría que refirmar). Criterio
sugerido en `CONTRATO_GENERADO`: `permanencia >= 12 meses` OR `monto anual >
umbral` OR `flag enterprise` → `canal = 'provider'` (sobre del proveedor, no
canvas). Los campos `provider`/`envelope_id` quedan nullable en el schema.

Lo que un proveedor agregaría sobre el baseline propio: testimonio corporativo
del proveedor y eventos capturados del lado de ellos ("documento visto") — no
integridad, que ya la da el anclaje. A los montos actuales (~$12.900/mes) el
peritaje cuesta más que lo disputado: el riesgo es aceptable, con piloto +
opinión legal escrita antes de escalar contratos grandes.

## Fuentes

Ley 25.506 arts. 2, 3, 5º (último párrafo post-27.446), 6º, 7º, 9 inc. b ·
CPCCN arts. 75, 286–288, 317 · Ley 25.326 · RFC 3161 / OpenTimestamps ·
debate completo en `.context/work/contratos-firma/debate/`.
