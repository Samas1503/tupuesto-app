# TuPuesto — app móvil (Expo / React Native)

Migración funcional de la app web (`app/`) a React Native con Expo SDK 54
(TypeScript). Android + iOS. La lógica de negocio (arqueo, stock, solicitudes,
cierre) es la misma que en web — se porta de `app/src` y va contra la misma API
(`https://tupuesto.vercel.app`).

## Correr

```sh
cd mobile
npm install
npx expo start          # Metro + QR para Expo Go
npx expo start --android
npx expo start --ios
```

Para apuntar a otra API (p.ej. `vercel dev` local):

```sh
EXPO_PUBLIC_API_URL=http://TU_IP_LAN:3000 npx expo start
```

(`localhost` no funciona desde el teléfono/simulador — usá la IP de tu máquina.)

Typecheck:

```sh
npx tsc --noEmit        # o: npm run typecheck
```

## Estructura

```
mobile/
├── App.tsx            # gate de sesión + navegación por rol + tema por categoría
├── index.ts           # registerRootComponent
├── app.json           # nombre TuPuesto, slug tupuesto, plugin expo-notifications
├── assets/icon.png    # icono (reutilizado de app/public/icon-512.png)
└── src/
    ├── types.ts       # copiado verbatim de app/src/types.ts
    ├── theme.ts       # paleta navy/blurple + accent por categoría (index.css)
    ├── lib/
    │   ├── auth.ts        # loginServer + token en AsyncStorage (tp-* keys)
    │   ├── store.ts       # REEMPLAZO de Dexie: tablas en memoria + cache AsyncStorage + pub/sub
    │   ├── sync.ts        # GET/POST /api/sync con Bearer — pull/push last-write-wins
    │   ├── snake.ts       # camel↔snake + pushRow (fire-and-forget)
    │   ├── data.ts        # hooks equivalentes a lib/data.ts (scoping por dueño)
    │   ├── notificar.ts   # expo-notifications: permiso al login + notif locales al pull
    │   ├── contratos.ts   # /api/contratos + /api/paquete (URLs absolutas)
    │   ├── pin.ts         # SHA-256 via expo-crypto + PIN aleatorio via getRandomBytesAsync
    │   ├── planes.ts      # límites por plan (verbatim)
    │   ├── arqueo.ts      # arqueo por conteo físico (verbatim)
    │   ├── scoring.ts     # puntajes vendedor/dueño (verbatim)
    │   ├── admin-metrics.ts # métricas del dashboard admin (verbatim)
    │   └── format.ts      # fechas/dinero es-AR (verbatim)
    ├── components/
    │   ├── ui.tsx         # kit propio: Screen, Card, Chip, Btn, Field, NumField,
    │   │                  # Select (modal), Segments, Toggle, Meter, Sheet, FAB…
    │   └── Header.tsx     # marca + campana (badge no-leídas) + nombre + Salir
    └── screens/
        ├── LoginScreen.tsx       # email+PIN, elegir PIN nuevo, reset por código
        ├── MiDiaScreen.tsx       # vendedor: turno, boleta multi-item, cierre, historial
        ├── HoyScreen.tsx         # dueño: turnos, solicitudes, confirmar, productos del día
        ├── DespachoScreen.tsx    # dueño: despacho por fecha, editar, reponer, comprobante
        ├── PreciosScreen.tsx     # dueño: catálogo (costo/venta/stock/activo)
        ├── PuestosScreen.tsx     # dueño: puestos + destino QR + límite de plan
        ├── VendedoresScreen.tsx  # dueño: equipo, PIN aleatorio, send-pin, baja lógica
        ├── StatsScreen.tsx       # dueño: matriz puesto×día, merma, productividad, pérdidas
        ├── ReportesScreen.tsx    # dueño premium: proyección, merma, ventas por producto
        ├── AdminScreen.tsx       # admin: gestión / dinero / puntajes / contratos
        └── NotifScreen.tsx       # panel de notificaciones (marca leídas al abrir)
```

## Decisiones

- **Navegación**: React Navigation (native-stack + bottom-tabs). La web usaba
  estado interno + navbar propia; en mobile tabs nativas para el dueño
  (Hoy/Despacho/Precios/Puestos/Equipo/Stats/Reportes), pantalla única para
  vendedor (MiDia) y admin (tabs internas). La campana abre `Notificaciones`
  como modal.
- **Sin Dexie**: `lib/store.ts` mantiene las 7 tablas en memoria con cache
  write-through en AsyncStorage (`tp-cache-*`). Misma semántica de merge
  (remota gana por id) y mismo esquema de ids locales (`max(id)+1`, paridad
  con `++id` de Dexie — incluida su limitación de colisiones entre
  dispositivos que crean filas sin sincronizar).
- **Auth**: misma key `tp-token` en AsyncStorage, TTL por rol igual que web
  (vendedor 8h / dueño 16h / admin ∞). Si un pull/push devuelve 401 se limpia
  la sesión y vuelve al login.
- **Push**: `expo-notifications` — permiso al login, notificaciones **locales**
  (scheduleNotificationAsync inmediata) para filas nuevas de `notificaciones`
  que llegan en el pull. No hay token push remoto: paridad con web, que usaba
  `new Notification()` del navegador.
- **PINs**: `expo-crypto` (SHA-256 hex). El server acepta hashes sha256 legado
  y los migra a scrypt en el login. En "elegir PIN" se pushea solo
  `{id, pin_hash, debe_cambiar_pin}` — el server rechaza otras columnas en la
  fila propia (403), que en web pasaba desapercibido porque el error se ignora.
- **Tema**: accent por categoría del dueño vía `AccentContext` (comida
  `#e07a2f`, postres `#e04f9f`, ropa `#8b5cf6`, mercadería `#0ea5e9`,
  juguetes `#f59e0b`, otro `#635bff`). Vendedor hereda la de su dueño.
- **Contratos (admin)**: listar, crear y compartir link con `Share` API nativa.
  La firma sigue siendo web (`/app/firmar?token=`).

## No portado (pendiente)

- **Modo demo** (`@demo.tupuesto`): en web vive 100% en IndexedDB con seed
  local/sql.js. En mobile el login va siempre al server — no hay base local
  para sostenerlo.
- **Foto de producto** (`imagen` dataURL): sin picker de imágenes — si la fila
  ya trae `imagen` se muestra; cargarla desde el celu queda pendiente
  (`expo-image-picker` no se agregó para mantener deps mínimas).
- **Descarga del paquete probatorio** (contratos): web usaba Blob/anchor DOM;
  quedó `getPaquete()` que devuelve el JSON (compartible por Share).
- **Historial del vendedor → tab "Día"** de Stats quedó portado; las barras
  `Meter` son aproximación nativa (no pixel-perfect).
- **Soporte/mailto** (SoporteBtn) y campo de foto con crop de web: pendientes.
- El cierre "anticipado" aprobado por el dueño sigue exigiendo el conteo del
  vendedor; la jornada pasa a `cerrada` igual que en web (estado + flag).

## Notas de API

- `POST /api/sync {accion:'login'}` devuelve `{token, usuario}`; el token es
  Bearer HMAC (`base64url(id|rol|exp|duenio_id).firma`).
- El pull del server ya viene scoped por tenant (el vendedor solo recibe las
  filas de su dueño), así que `data.ts` filtra además por `duenioId` del
  dueño logueado — igual que en web.
- Non-admin solo puede escribir `pin_hash`/`debe_cambiar_pin` de su propia
  fila en `usuarios` (403 en otras columnas/filas). La web lo intenta igual y
  se traga el error — en mobile se respeta esa restricción en "elegir PIN";
  altas de vendedores/dueños pushean la fila completa (mismo comportamiento
  que web: si el server lo rechaza queda solo local hasta que sync lo limpie).
