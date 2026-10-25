import { useEffect, useRef, useState } from 'react'
import { Button, Tabs } from '@heroui/react'
import { IHoy, IDespacho, IPrecios, IPuestos, IEquipo, IStats, IReportes } from './components/icons'
import PlanBadge from './components/PlanBadge'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Rol } from './types'
import { db } from './db'
import Login from './components/Login'
import Hoy from './views/Hoy'
import Despacho from './views/Despacho'
import Catalogo from './views/Catalogo'
import Puestos from './views/Puestos'
import Vendedores from './views/Vendedores'
import Historial from './views/Historial'
import Reportes from './views/Reportes'
import MiDia from './views/MiDia'
import Admin from './views/Admin'
import FirmarContrato from './views/FirmarContrato'

type Vista = 'hoy' | 'despacho' | 'catalogo' | 'puestos' | 'vendedores' | 'historial' | 'reportes'

const NAV_DUENIO: { id: Vista; label: string; Icon: (p: { className?: string }) => React.ReactNode }[] = [
  { id: 'hoy', label: 'Hoy', Icon: IHoy },
  { id: 'despacho', label: 'Despacho', Icon: IDespacho },
  { id: 'catalogo', label: 'Precios', Icon: IPrecios },
  { id: 'puestos', label: 'Puestos', Icon: IPuestos },
  { id: 'vendedores', label: 'Equipo', Icon: IEquipo },
  { id: 'historial', label: 'Stats', Icon: IStats },
  { id: 'reportes', label: 'Reportes', Icon: IReportes },
]

type Sesion = { rol: Rol; id: number }

// sesión unificada: tp-rol + tp-user-id. Migración de keys viejas:
// 'tp-duenio-id' → rol duenio con ese id; 'tp-vendedor' → rol vendedor
function leerSesionLS(): Sesion | null {
  const rol = localStorage.getItem('tp-rol')
  const id = localStorage.getItem('tp-user-id')
  if ((rol === 'duenio' || rol === 'vendedor' || rol === 'admin') && id != null && id !== '') {
    return { rol, id: Number(id) }
  }
  const duenioId = localStorage.getItem('tp-duenio-id')
  if (duenioId) return { rol: 'duenio', id: Number(duenioId) }
  const vendedorId = localStorage.getItem('tp-vendedor')
  if (vendedorId) return { rol: 'vendedor', id: Number(vendedorId) }
  return null
}

function limpiarSesionLS() {
  localStorage.removeItem('tp-rol')
  localStorage.removeItem('tp-user-id')
  // keys viejas — por si quedaron de la sesión anterior
  localStorage.removeItem('tp-duenio-id')
  localStorage.removeItem('tp-vendedor')
  localStorage.removeItem('tp-vendedor-id')
}

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesionLS)
  const [vista, setVista] = useState<Vista>('hoy')
  const navRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState({ left: 0, width: 0 })

  const usuarios = useLiveQuery(() => db.usuarios.toArray(), [])

  // persiste la sesión (también materializa la migración de keys viejas)
  useEffect(() => {
    if (sesion) {
      localStorage.setItem('tp-rol', sesion.rol)
      localStorage.setItem('tp-user-id', String(sesion.id))
    }
  }, [sesion])

  // validación contra `usuarios`: debe seguir activo && !eliminado.
  // Mientras Dexie carga se confía en lo persistido; si el usuario fue
  // desactivado se limpia la sesión abajo.
  const tablaCargada = usuarios !== undefined
  const usuario = usuarios?.find(u => u.id === sesion?.id)

  const sesionValida =
    sesion == null ? false
    : !tablaCargada ? true
    : !!usuario && usuario.activo && !usuario.eliminado

  // tema por categoría — el vendedor hereda la de su dueño; admin → 'otro'
  const duenioDelTema =
    usuario?.rol === 'duenio' ? usuario
    : usuario?.rol === 'vendedor' ? usuarios?.find(d => d.id === usuario.duenioId)
    : undefined
  useEffect(() => {
    document.documentElement.dataset.tema = duenioDelTema?.categoria ?? 'otro'
  }, [duenioDelTema?.categoria])

  useEffect(() => {
    if (sesion && tablaCargada && !sesionValida) {
      limpiarSesionLS()
      setSesion(null)
    }
  }, [sesion, tablaCargada, sesionValida])

  // la pill accent se desplaza midiendo el tab seleccionado — robusto a
  // scroll interno y cambios de tamaño del contenedor (pantallas angostas)
  useEffect(() => {
    const medir = () => {
      const idx = NAV_DUENIO.findIndex(x => x.id === vista)
      const el = navRef.current?.querySelectorAll('[role="tab"]')[idx] as HTMLElement | undefined
      // offsetLeft/Width no se ven afectados por el :active scale → medición exacta
      if (el) {
        // cuadrado con esquinas redondeadas, centrado — mismo en angosta y ancha
        const W = Math.min(el.offsetWidth - 6, el.offsetHeight - 8)
        setPill({ left: el.offsetLeft + (el.offsetWidth - W) / 2, width: W })
      }
    }
    medir()
    const t1 = requestAnimationFrame(medir)
    const t2 = setTimeout(medir, 150) // tras fuentes/transición de entrada
    const ro = new ResizeObserver(medir)
    if (navRef.current) ro.observe(navRef.current)
    return () => { cancelAnimationFrame(t1); clearTimeout(t2); ro.disconnect() }
  }, [vista, sesion?.rol])

  function entrar(rol: Rol, id: number) {
    limpiarSesionLS() // descarta keys viejas antes de escribir las nuevas
    localStorage.setItem('tp-rol', rol)
    localStorage.setItem('tp-user-id', String(id))
    setSesion({ rol, id })
    setVista('hoy')
  }

  // limpia la sesión y vuelve al Login
  function salir() {
    limpiarSesionLS()
    setSesion(null)
    setVista('hoy')
  }

  // ruta pública de firma electrónica — /app/firmar?token=… entra sin sesión.
  // La app vive bajo /app (base de Vite), así que el path llega como /app/firmar.
  if (location.pathname.replace(/\/+$/, '').endsWith('/firmar')) {
    return <FirmarContrato />
  }

  // gate unificado — toda la app detrás del login (sin navbar ni vistas)
  if (!sesionValida) return <Login onLogin={entrar} />

  const nombreSesion = usuario?.nombre ?? (sesion!.rol === 'admin' ? 'Admin' : undefined)

  return (
    <div className="min-h-dvh bg-paper text-navy flex flex-col">
      {/* navbar estilo landing: blanco translúcido, logo navy/blurple */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-border">
        <div className="relative max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* logo del tema: el icon.svg como máscara → silueta al accent */}
            <div
              className="h-8 w-8 rounded-[9px] shrink-0 bg-accent"
              style={{
                WebkitMaskImage: `url(${import.meta.env.BASE_URL}icon.svg)`,
                maskImage: `url(${import.meta.env.BASE_URL}icon.svg)`,
                WebkitMaskSize: 'contain', maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center', maskPosition: 'center',
              }}
              role="img" aria-label="TuPuesto"
            />
            <span className="font-extrabold tracking-tight text-xl leading-none text-navy">
              Tu<span className="text-accent">Puesto</span>
            </span>
            <span className="hidden sm:inline text-[0.7rem] font-semibold tracking-[0.14em] uppercase text-muted/60">
              control de puestos
            </span>
          </div>

          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <span className="hidden sm:inline"><PlanBadge /></span>
            <span className="text-sm font-semibold truncate max-w-36">{nombreSesion ?? '…'}</span>
            <Button size="sm" variant="tertiary" onPress={salir}>Salir</Button>
          </div>
        </div>

        {/* strip degradado — del accent del tema a un fade claro */}
        <div className="absolute bottom-0 inset-x-0 h-[3px]"
          style={{ background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 40%, white) 60%, transparent)' }} />
      </header>

      {/* contenido */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5 pb-28">
        {sesion!.rol === 'admin' ? (
          <Admin />
        ) : sesion!.rol === 'vendedor' ? (
          <MiDia />
        ) : (
          <>
            {vista === 'hoy' && <Hoy />}
            {vista === 'despacho' && <Despacho />}
            {vista === 'catalogo' && <Catalogo />}
            {vista === 'puestos' && <Puestos />}
            {vista === 'vendedores' && <Vendedores />}
            {vista === 'reportes' && <Reportes />}
            {vista === 'historial' && <Historial />}
          </>
        )}
      </main>

      {/* navegación inferior flotante — píldora elevada, solo dueño */}
      {sesion!.rol === 'duenio' && (
        <nav className="fixed bottom-3 inset-x-3 z-50">
          <div ref={navRef} className="relative max-w-2xl mx-auto bg-surface/90 backdrop-blur-md border border-border/60 rounded-full shadow-xl shadow-navy/10 px-1.5">
            {/* pill deslizante — se mueve al tab activo */}
            <div
              className="absolute top-1 bottom-1 w-[52px] rounded-2xl bg-accent pointer-events-none z-0"
              style={{
                transform: `translateX(${pill.left}px) scaleX(${pill.width / 52})`,
                transformOrigin: 'left center',
                opacity: pill.width ? 1 : 0,
                willChange: 'transform',
                transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
              }}
            />
            <Tabs
              selectedKey={vista}
              onSelectionChange={k => setVista(k as Vista)}
            >
              <Tabs.ListContainer className="!bg-transparent relative">
                <Tabs.List aria-label="Secciones" className="w-full !bg-transparent !shadow-none !p-0 !rounded-full !overflow-visible">
                  {NAV_DUENIO.map(item => (
                    <Tabs.Tab
                      key={item.id}
                      id={item.id}
                      className="relative z-10 flex-1 basis-0 !min-w-0 flex-col gap-0.5 !h-auto !py-3.5 !my-1.5 !rounded-full !bg-transparent text-[0.6rem] font-bold text-muted overflow-hidden whitespace-nowrap data-[selected]:!text-white"
                    >
                      <item.Icon />
                      {item.label}
                      <Tabs.Indicator className="!hidden" />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          </div>
        </nav>
      )}
    </div>
  )
}
