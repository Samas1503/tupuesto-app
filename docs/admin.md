# Admin — dashboard del sistema

Solo el rol `admin` llega acá (`admin@demo.tupuesto`/`0000` en demo). Tres tabs:

## Gestión (`views/Admin.tsx`)

- **Dueños**: nombre, email, chip de categoría (coloreado con su tema), cantidad de
  vendedores y puestos, activo, eliminación lógica + restaurar, alta con select de
  categoría + PIN aleatorio que se manda por email
- **Vendedores**: nombre, dueño (`duenioId`), activo, resetear PIN
- **Puestos**: nombre, ubicación, dueño, activo (solo lectura)
- **Jornadas**: últimas 15 — fecha, vendedor, puesto, estado, fondo y cobrado
- Strip de contadores globales (dueños/vendedores/puestos/jornadas/eliminados)

## Dinero (`views/AdminMoney.tsx` + `lib/admin-metrics.ts`)

- $ total movido 30d + sparkline de 14 días
- Por método de pago: efectivo/QR/transferencia ($ + %)
- Ranking por dueño y por puesto
- Jornadas abiertas ahora con $ en curso

## Puntajes (`views/AdminScores.tsx` + `lib/scoring.ts`)

Score 0-100 de **todos** los usuarios (dueños Y vendedores — el admin es el único
que lo ve, pensado para futuras features de gamificación/bonus). Ventana: últimos
14 días.

| componente | peso | qué mide |
|---|---|---|
| exactitud | 40 | qué tan bien cierra la caja (|esperado−contado| por jornada cerrada) |
| frecuencia | 25 | jornadas en la ventana vs 12 días hábiles esperados |
| merma | 15 | pérdida por descarte / valor movido (a precioCosto) |
| volumen | 20 | $ vendido relativo al mejor del período |
| bonus | +10 | ≥3 confirmadas sin solicitudes pendientes |

- Vendedor → su desempeño propio por jornadas
- Dueño → el agregado de su equipo (`scoreDuenio` — las jornadas de SUS vendedores)

La vista muestra ranking desc, chip de rol, barra coloreada (≥80 verde / 60-79 ámbar
/ <60 rojo) y breakdown expandible por componente.
