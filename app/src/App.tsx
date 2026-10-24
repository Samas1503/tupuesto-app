import { useEffect, useRef, useState } from 'react'
import { Button, Tabs } from '@heroui/react'
import { Icon } from '@iconify/react'
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
import MiDia from './views/MiDia'
import Admin from './views/Admin'

type Vista = 'hoy' | 'despacho' | 'catalogo' | 'puestos' | 'vendedores' | 'historial'

const NAV_DUENIO: { id: Vista; label: string; icon: string }[] = [
  { id: 'hoy', label: 'Hoy', icon: 'tabler:clipboard-check' },
  { id: 'despacho', label: 'Despacho', icon: 'tabler:package' },
  { id: 'catalogo', label: 'Precios', icon: 'tabler:tag' },
  { id: 'puestos', label: 'Puestos', icon: 'tabler:building-store' },
  { id: 'vendedores', label: 'Equipo', icon: 'tabler:users' },
  { id: 'historial', label: 'Stats', icon: 'tabler:chart-bar' },
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

  const duenios = useLiveQuery(() => db.duenios.toArray(), [])
  const vendedores = useLiveQuery(() => db.vendedores.toArray(), [])

  // persiste la sesión (también materializa la migración de keys viejas)
  useEffect(() => {
    if (sesion) {
      localStorage.setItem('tp-rol', sesion.rol)
      localStorage.setItem('tp-user-id', String(sesion.id))
    }
  }, [sesion])

  // validación contra la tabla del rol: el usuario debe seguir activo && !eliminado.
  // Admin (id 0) no tiene tabla — siempre válido. Mientras Dexie carga se confía
  // en lo persistido; si el usuario fue desactivado se limpia la sesión abajo.
  const tablaCargada =
    sesion?.rol === 'duenio' ? duenios !== undefined
    : sesion?.rol === 'vendedor' ? vendedores !== undefined
    : true

  const usuario =
    sesion?.rol === 'duenio' ? duenios?.find(d => d.id === sesion.id)
    : sesion?.rol === 'vendedor' ? vendedores?.find(v => v.id === sesion.id)
    : undefined

  const sesionValida =
    sesion == null ? false
    : sesion.rol === 'admin' ? true
    : !tablaCargada ? true
    : !!usuario && usuario.activo && !usuario.eliminado

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

  // gate unificado — toda la app detrás del login (sin navbar ni vistas)
  if (!sesionValida) return <Login onLogin={entrar} />

  const nombreSesion = sesion!.rol === 'admin' ? 'Admin' : usuario?.nombre

  return (
    <div className="min-h-dvh bg-paper text-navy flex flex-col">
      {/* navbar estilo landing: blanco translúcido, logo navy/blurple */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-border">
        <div className="relative max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/icon.svg"
              alt=""
              className="h-8 w-8 rounded-[9px] shrink-0"
            />
            <span className="font-extrabold tracking-tight text-xl leading-none text-navy">
              Tu<span className="text-blurple">Puesto</span>
            </span>
            <span className="hidden sm:inline text-[0.7rem] font-semibold tracking-[0.14em] uppercase text-muted/60">
              control de puestos
            </span>
          </div>

          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <span className="text-sm font-semibold truncate max-w-36">{nombreSesion ?? '…'}</span>
            <Button size="sm" variant="tertiary" onPress={salir}>Salir</Button>
          </div>
        </div>

        {/* strip degradado — firma de marca */}
        <div className="absolute bottom-0 inset-x-0 h-[3px] bg-[linear-gradient(90deg,#a960ee,#635bff_30%,#00d4ff_55%,#25d366_80%,#ffcb57)]" />
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
                      <Icon icon={item.icon} className="text-xl leading-none" />
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
