# Contratos con firma electrónica — TuPuesto

Sistema admin-only para generar contratos de suscripción a suscriptores, capturar firma en celular y resguardar la evidencia probatoria.

## Flujo

1. **Admin crea contrato** (tab Contratos): razón social, CUIT, email, domicilio, plan, precio → la app genera un link `/app/firmar?token=<uuid>` y lo envía por Resend al suscriptor.
2. **Suscriptor firma** (página pública sin login): ve el contrato → "Enviar código" (OTP por email) → lo valida → dibuja la firma en canvas → "Acepto" → firma.
3. **Backend**: PDF canónico (texto de plantilla + firma) → SHA-256 → eventos hash-chain append-only → anclaje OpenTimestamps → copia del PDF al email del suscriptor.
4. **Admin** ve el estado (enviado/firmado) y puede exportar el **paquete probatorio** (JSON con PDF, eventos, receipt OTS, instrucciones).

## Esquema de datos

- `contratos`: token, datos JSONB, `cuerpo` (texto renderizado), `pdf` (BYTEA), `pdf_hash`, `estado`, `provider`/`envelope_id` (para tier externo futuro), `anclaje_pendiente`.
- `firma_eventos`: **append-only con trigger que aborta UPDATE/DELETE** — cada evento (solicitud/otp/visto/trazo/aceptado/anclado/copia/exportado) tiene `prev_hash` + `event_hash` (SHA-256 de `prev_hash|tipo|payload|ts`) → cadena verificable recomputando.

## Validez legal (Argentina)

- La firma producida es **firma electrónica simple** (Ley 25.506, art. 5º in fine post-27.446) — **NO firma digital certificada** (que requiere certificante licenciado: ONTI, Modernización-PFDR, Encode, Lakaut, Box Custodia, Digilogix).
- Si el suscriptor desconoce la firma, **TuPuesto debe acreditar su validez** — el audit trail es la respuesta: OTP + IP + hash anclado + copia por email + conducta posterior.
- Cláusulas del contrato: domicilio electrónico (art. 75 CPCCN), consentimiento del medio electrónico, validación OTP, integridad por SHA-256.
- La copia por email al firmante es la defensa anti-repudio principal — el firmante conserva su ejemplar en su inbox.

## Límites honestos

- El canvas no prueba identidad (solo intención) — la autoría se acumula por contexto.
- Sin anclaje completado (`anclaje_pendiente`), la integridad queda a cargo del log.
- Si los emails de suscriptores son compartidos (pymes familiares), la atribución se debilita — agregar segundo canal.
- Suscriptores consumidores (Ley 24.240) → piso probatorio más exigente.
- Contratos de alto monto → tier de proveedor externo (campos `provider`/`envelope_id` ya listos).

## Endpoints

- `POST /api/contratos` — crear + enviar link (admin) · `GET /api/contratos` lista · `GET ?token=` render
- `POST /api/firmar` — `paso: 'visto' | 'otp' | 'firmar'` — OTP en `codigos_reset` (`entidad='firma_contrato'`), consumo atómico al firmar
- `GET /api/paquete?contrato_id=` — paquete probatorio exportable

## Datos del titular (en `api/templates/contrato-v1.js`)

`PROVEEDOR`: razón social `TuPuesto` · CUIT `20-44706400-7` · domicilio pendiente (completar con el real).
