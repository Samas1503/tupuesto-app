**TuPuesto** · `app/` — la PWA del producto

> Wedge local-first: arqueo por conteo físico al cierre, doble corriente
> efectivo/QR, merma acotada, confirmación del dueño. Datos en IndexedDB —
> sin backend todavía.

```bash
npm install
npm run dev       # dev server (sin service worker)
npm run build     # tsc -b && vite build
npm run preview   # sirve dist/ con SW ← así se prueba offline
npm run lint      # oxlint
```

Stack: Vite · React 19 · TS · HeroUI **v3** · Tailwind **v4** · Dexie ·
vite-plugin-pwa. Todo lo demás — dominio, reglas, glosario, decisiones —
vive en la raíz del repo: `RULES.MD`, `GLOSARY.MD`, `docs/`,
`decisions.md`, `AGENTS.MD`.

## Demo estática (Vercel)

`npm run build` sirve todo estático. `public/tupuesto.sqlite` + `public/sql-wasm.wasm`
hidratian IndexedDB vía `sql.js` — regenerar el archivo con
`node scripts/gen-sqlite.mjs`. Si falta el archivo, cae al seed de `db.ts`.

Deploys: landing → `tupuesto-app.vercel.app` (proyecto raíz, `vercel.json`);
app → `app-ten-tan-35.vercel.app` (root dir `app/`, framework Vite).
