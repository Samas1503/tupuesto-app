<div align="center">

# TuPuesto

**El dueño carga lo que sale a la mañana. El vendedor cuenta lo que quedó a la noche.**
La diferencia se ve el mismo día — no a fin de mes.

`control de puestos` `venta ambulante` `Argentina` `PWA offline-first`

![status](https://img.shields.io/badge/estado-pre--MVP-orange)
![stack](https://img.shields.io/badge/stack-vite%20%C2%B7%20react%2019%20%C2%B7%20heroui%20v3%20%C2%B7%20dexie-635bff)
![fase](https://img.shields.io/badge/validaci%C3%B3n-gate%200%20%28preventa%29-0a2540)

</div>

---

Es para dueños de micro-pymes con **2+ puestos ambulantes** que no pueden estar
en todos lados. No es un POS. No es una facturadora. No reporta a AFIP.
Es la libreta privada del dueño — un control interno anti-faltante.

```bash
# app — PWA del producto
cd app && npm install && npm run dev

# build + preview real (activa el service worker)
cd app && npm run build && npm run preview

# landing de preventa
python3 -m http.server 8765 --directory landing
```

## El repo

| Dónde | Qué |
|---|---|
| `app/` | La app — PWA local-first, datos en IndexedDB |
| `landing/` | Landing de preventa estática (estilo Stripe) |
| `preventa/` | Guion de contacto + criterios del Gate 0 |
| `decisions.md` | ADR-001 — decisión de negocio lockeada |

## Documentos

- **RULES.MD** → lo que no se negocia. Leer antes de proponer nada.
- **GLOSARY.MD** → el vocabulario del dominio (arqueo, despacho, merma, faltante).
- **docs/** → arquitectura, modelo de datos, arqueo, vistas, desarrollo (`docs/README.md`).
- **AGENTS.MD** → instrucciones para agentes que trabajen acá.
- `docs/integracion-mercado-pago.md` → roadmap D post-piloto (QR verificado).
- `preventa/mercado-pago.md` → cobro de señas con MP (link + API).

## Demo

El seed trae el negocio de la landing: tres puestos — Marcos en Feria Central,
Alejandra en Plaza Italia, Diego en Costanera — cuatro semanas de historial y un
día de hoy con faltante de $16.400. El toggle **Dueño / Vendedor** arriba a la
derecha recorre los dos flujos en el mismo dispositivo.

<div align="center">
<sub>TuPuesto · pre-MVP · validado por gates, no por entusiasmo</sub>
</div>
