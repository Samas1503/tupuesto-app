<div align="center">

# TuPuesto

**El dueño despacha a la mañana. El vendedor anota cada venta y cierra con un tap.**
La diferencia se ve el mismo día — no a fin de mes.

`control de puestos` `venta ambulante` `Argentina` `PWA` `tiempo real`

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
| `app/` | La app — PWA, Dexie (cache) ↔ Neon Postgres tiempo real |
| `api/` | Serverless Vercel: `sync` (pull/push), `request-reset`/`verify-reset` (código por email), `send-pin`, `mp-preference`, `mp-webhook` |
| `docs/` | Documentación técnica dividida por tema |
| `landing/` | Landing de preventa estática |
| `preventa/` | Guion de contacto + criterios del Gate 0 |
| `decisions.md` | ADR-001 — decisión de negocio lockeada |

## Documentos

- **RULES.MD** → lo que no se negocia. Leer antes de proponer nada.
- **GLOSARY.MD** → el vocabulario del dominio (arqueo, despacho, merma, faltante).
- **docs/** → arquitectura, modelo de datos, arqueo, vistas, desarrollo, usuarios (roles/temas), backend Neon, admin (`docs/README.md`).
- **AGENTS.MD** → instrucciones para agentes que trabajen acá.
- `docs/integracion-mercado-pago.md` → roadmap D post-piloto (QR verificado).
- `preventa/mercado-pago.md` → cobro de señas con MP (link + API).

## Demo

Demo en vivo: **landing** [tupuesto.vercel.app](https://tupuesto.vercel.app) →
botón "▶ Demo" → **app** [tupuesto-demo.vercel.app](https://tupuesto-demo.vercel.app)
(Dexie ↔ Neon Postgres — sync tiempo real cada 30s + push en cada write).

**Login unificado** (un solo form detecta el rol por email):

| Rol | Credencial |
|---|---|
| Dueño | `duenio@demo.tupuesto` / `0000` |
| Vendedor | `marcos@demo.tupuesto` / `1234`, `alejandra@demo.tupuesto` / `2345`, `diego@demo.tupuesto` / `3456` |
| Admin | `admin@demo.tupuesto` / `0000` |

El seed trae el negocio de la landing: tres puestos — Marcos en Feria Central
(cerrado OK), Alejandra en Plaza Italia (faltante $16.400 + merma), Diego en
Costanera (abierto con reposición y ventas). El dueño tiene categoría `comida`
(tema naranja); los vendedores acceden a su turno desde el mismo login.

<div align="center">
<sub>TuPuesto · pre-MVP · validado por gates, no por entusiasmo</sub>
</div>
