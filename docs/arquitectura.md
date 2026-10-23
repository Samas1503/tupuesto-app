**TuPuesto** · Arquitectura

PWA **local-first**. Los datos viven en IndexedDB del dispositivo (Dexie);
no hay backend de datos todavía — solo `api/` serverless para cobros MP y
emails (Resend). El modelo coopera con sync futura: entidades autónomas,
mapeo 1:1 + auth por rol.

```mermaid
flowchart LR
    subgraph UI["React 19 · HeroUI v3 · Tailwind v4"]
        Hoy["views/Hoy"]
        Despacho["views/Despacho"]
        MiDia["views/MiDia"]
        Otras["Catálogo · Puestos · Equipo · Estadísticas"]
    end
    subgraph Lib["capa de dominio"]
        Arq["lib/arqueo.ts<br/>matemática pura"]
        Dat["lib/data.ts<br/>useLiveQuery"]
        Fmt["lib/format.ts<br/>es-AR"]
    end
    DB[("IndexedDB 'tupuesto'<br/>Dexie v4")]
    API[["api/ serverless<br/>mp-preference · mp-webhook · send-pin"]]
    SW{{"service worker<br/>vite-plugin-pwa"}}

    UI --> Dat --> DB
    UI --> Arq
    UI --> API
    SW -.->|offline| UI
```

## Despacho vs. turno (ADR-002)

**Despacho** = productos → puesto (sin vendedor ni fondo). **Turno** =
vendedor + fondo de caja + confirmación del despacho — se arma en Hoy
(FAB `+`) o cuando el vendedor toma un despacho libre en MiDia. Multi-turno
por puesto/día: solo bloquea turnos `abierta` en el mismo puesto.

## Ciclo de vida de la jornada

```mermaid
stateDiagram-v2
    [*] --> abierta : dueño despacha (con o sin turno armado)
    abierta --> cerrada : vendedor cierra el día (cálculo automático)
    cerrada --> confirmada : dueño confirma la rendición
    confirmada --> [*]
```

Quién escribe qué (R12): el dueño abre/asigna, el vendedor vende y cierra,
el dueño confirma.
