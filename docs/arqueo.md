**TuPuesto** · El arqueo — `src/lib/arqueo.ts`

Matemática pura. Si una vista calcula a mano, está mal (R4).

```ts
vendido(p)  = cargado(p) − remanente(p) − merma(p)   // cargado = despacho + reposiciones
totalVentas = Σ vendido(p) × precio(p)
esperado    = fondoCaja + totalVentas                // fondo vuelve adentro del efectivo
cobrado     = efectivoContado + qrTotal
diferencia  = cobrado − esperado   // <0 faltante · >0 sobrante
```

Flags calculados, no guardados:

| Flag | Condición | Qué dice |
|---|---|---|
| `qrFueraDeCuenta` | `qrTotal > 0 && qrDestino === 'vendedor'` | cobros digitales fuera del radar |
| `qrEnCero` | `qrTotal === 0` + promo 28d > 0 | declaró $0 digital |
| merma anómala | `merma% > 2 × media cross-puesto` | la variable libre firmando |
| `cruceCierre` | registro ≠ conteo | doble fuente disponible (off hoy) |

## Registro en curso (abierta)

`vendidosRegistrados`, `ventasTotal`, `stockActual` (= cargado − registrado,
tope del stepper), `gananciaPotencial` (margen del despacho),
`costoVentas`, `horasTurno` (createdAt → cierre/confirmación/ahora).

**ADR-003:** el cierre es automático — remanente y plata salen del registro.
Si el vendedor no anota una venta, el sistema no la ve. `cruceCierre` queda
como palanca si los pilotos piden el conteo físico de vuelta.
