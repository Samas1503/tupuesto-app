# Notificaciones — TuPuesto

Panel estilo Instagram + push del SO + sincronización cross-device vía Neon.

## Tipos (`Notificacion.tipo`)

| tipo | icono | disparador | destinatario |
|---|---|---|---|
| `solicitud` | campana | vendedor pide cierre anticipado; dueño aprueba/rechaza | dueño / vendedor |
| `cierre` | check | vendedor cierra el turno (conteo físico) | dueño |
| `stock` | caja | producto queda al ≤20% del `stockDia` en una venta | dueño |
| `login` | persona | un dueño inicia sesión | admin |
| `sistema` | info | soporte técnico (botón ❓) y mensajes genéricos | admin / libre |

## Arquitectura

- Tabla `notificaciones`: Dexie v10 (`++id, usuarioId, leida, createdAt`) + Neon + whitelist en `api/sync.js` → cruza dispositivos por el pull.
- `lib/notificar.ts` — `notificar()` escribe Dexie + `pushRow` + dispara `Notification` del SO si el destinatario es la sesión actual; `avisarNuevasPendientes()` corre tras cada `syncPull` para las que llegan remotas; `pedirPermisoNotif()` tras login.
- `components/NotifBell.tsx` — campana en header, badge de no leídas, panel (30 últimas), marcar-todas-al-abrir.
- `components/SoporteBtn.tsx` — botón ❓ en header (dueños/vendedores) → mensaje → notificación `sistema` a todos los admins.
- Iconos: SVG propios en `icons.tsx` (`INotif`, `ICheck`, `ICaja`, `IPersona`, `IInfo`, `ISoporte`) — sin emojis.
