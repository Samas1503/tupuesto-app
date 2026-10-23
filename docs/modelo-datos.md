**TuPuesto** · Modelo de datos — Dexie `tupuesto` (v4)

| Tabla | La escribe | Clave |
|---|---|---|
| `productos` | dueño | nombre, `precio`, `precioCosto?`, `imagen?`, `ingredientes?`, activo, orden |
| `puestos` | dueño | nombre, ubicacion, `qrDestinoDefault` ∈ `negocio`/`vendedor` |
| `vendedores` | dueño | nombre, `email?`, `pin?`, `debeCambiarPin?`, `puestoId?` (preferencia), activo |
| `jornadas` | dueño abre · vendedor cierra · dueño confirma | ver abajo |
| `ventas` | vendedor | `jornadaId`, `items[]`, `total`, `metodoPago`, `createdAt` (v3) |
| `solicitudes` | vendedor pide · admin resuelve | `tipo`, `vendedorId`, `motivo?`, `estado` (v4) |

`Jornada` = puesto + `fecha` + (turno: `vendedorId?` + `fondoCaja?`):

- apertura: `despacho: [{productoId, cantidad}]`, `createdAt`
- en curso: `reposiciones: [{items[], createdAt}]` — stock extra, separado
- `cierre` (automático): `remanente` (= cargado − vendido), `merma`,
  `efectivoContado`, `qrTotal` (= QR+transf. registradas), `qrDestino`,
  `nota?`, `cerradaAt`
- estados `abierta → cerrada → confirmada` + `confirmadaAt`
- índices: `fecha`, `puestoId`, `vendedorId`, `[fecha+puestoId]`, `[fecha+vendedorId]`

`Venta` = registro por producto del turno (modal tap): 1 producto ×
cantidad × método — el rail para la integración de pagos futura.

`Solicitud` = pedido vendedor→admin (hoy `eliminar-usuario`); solo el
admin ejecuta bajas.
