**TuPuesto** · Vistas

| Vista | Rol | Hace |
|---|---|---|
| `Hoy` | dueño | tabs **Turnos** (cards, confirmar rendición, trazabilidad) / **Productos** (disponible = sobrante ayer + despacho − vendido) · barra "Cobrado hoy" vs. meta · FAB = nuevo turno completo |
| `Despacho` | dueño | FAB + modal "Nuevo despacho" (puesto + picker dinámico + comprobante) · calendario colapsable (max hoy) filtra la lista · Editar y Reponer en jornadas abiertas |
| `Catalogo` | dueño | ABM productos: precio venta vs. `precioCosto` → margen %, imagen, ingredientes |
| `Puestos` | dueño | info principal + jornada del día · FAB nuevo puesto (sin vendedor — se asigna por turno) |
| `Equipo` | dueño | ABM vendedores (nombre + email, PIN aleatorio → email vía `api/send-pin`, reseteo) · stats (turnos, horas, unidades, $) · aprueba/rechaza solicitudes de baja |
| `Estadísticas` | dueño | matriz doble entrada puesto × día · productividad ($/h) · ventas vs. gastos y pérdidas · timeline horario del día |
| `MiDia` | vendedor | login email+PIN (primer ingreso → elegir PIN) · tomar turno libre (fija fondo) · "Vender" = modal por producto + método · "Mi turno" recibí/repuse/quedé · cerrar = nota + botón |

Sesión en `localStorage` (`tp-rol`, `tp-vendedor`) — mecanismo de demo;
auth real espera backend (post-Gate 0). Los emails salen por Resend;
si `api/` no corre (dev local sin `vercel dev`), el PIN se muestra como
fallback una sola vez.
