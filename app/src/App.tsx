import { useState } from 'react'
import { Tabs, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { Icon } from '@iconify/react'
import type { Rol } from './types'
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

export default function App() {
  const [rol, setRol] = useState<Rol>(() => (localStorage.getItem('tp-rol') as Rol) ?? 'duenio')
  const [vista, setVista] = useState<Vista>('hoy')

  function cambiarRol(keys: Set<string>) {
    const r = [...keys][0] as Rol | undefined
    if (!r) return
    setRol(r)
    localStorage.setItem('tp-rol', r)
  }

  return (
    <div className="min-h-dvh bg-paper text-navy flex flex-col">
      {/* banda de marca */}
      <header className="relative bg-navy text-white sticky top-0 z-40 overflow-hidden">
        {/* glows de marca */}
        <div className="absolute -top-24 -left-12 w-72 h-72 rounded-full bg-blurple/30 blur-3xl pointer-events-none" />
        <div className="absolute -top-28 -right-16 w-64 h-64 rounded-full bg-[#00d4ff]/15 blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/kioskpay-ios-light-512x512.svg"
              alt=""
              className="h-8 w-8 rounded-[9px] shrink-0"
            />
            <span className="font-extrabold tracking-tight text-xl leading-none">
              Tu<span className="text-[#8f8aff]">Puesto</span>
            </span>
            <span className="hidden sm:inline text-[0.7rem] font-semibold tracking-[0.14em] uppercase text-white/50">
              control de puestos
            </span>
          </div>

          <div className="rounded-full bg-white/10 p-1 backdrop-blur-sm border border-white/10">
            <ToggleButtonGroup
              selectionMode="single"
              selectedKeys={new Set([rol])}
              onSelectionChange={k => cambiarRol(k as Set<string>)}
              aria-label="Rol"
              size="sm"
              className="!gap-0"
            >
              <ToggleButton id="duenio" className="!rounded-full data-[selected]:!bg-white data-[selected]:!text-navy data-[selected]:!shadow-md !text-white/70 !bg-transparent !border-0 !shadow-none !px-3.5">
                Dueño
              </ToggleButton>
              <ToggleButton id="vendedor" className="!rounded-full data-[selected]:!bg-white data-[selected]:!text-navy data-[selected]:!shadow-md !text-white/70 !bg-transparent !border-0 !shadow-none !px-3.5">
                Vendedor
              </ToggleButton>
              <ToggleButton id="admin" className="!rounded-full data-[selected]:!bg-white data-[selected]:!text-navy data-[selected]:!shadow-md !text-white/70 !bg-transparent !border-0 !shadow-none !px-3.5">
                Admin
              </ToggleButton>
            </ToggleButtonGroup>
          </div>
        </div>

        {/* strip degradado — firma de marca */}
        <div className="absolute bottom-0 inset-x-0 h-[3px] bg-[linear-gradient(90deg,#a960ee,#635bff_30%,#00d4ff_55%,#25d366_80%,#ffcb57)]" />
      </header>

      {/* contenido */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-5 pb-28">
        {rol === 'admin' ? (
          <Admin />
        ) : rol === 'duenio' ? (
          <>
            {vista === 'hoy' && <Hoy />}
            {vista === 'despacho' && <Despacho />}
            {vista === 'catalogo' && <Catalogo />}
            {vista === 'puestos' && <Puestos />}
            {vista === 'vendedores' && <Vendedores />}
            {vista === 'historial' && <Historial />}
          </>
        ) : (
          <MiDia />
        )}
      </main>

      {/* navegación inferior — solo dueño */}
      {rol === 'duenio' && (
        <nav className="fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur border-t border-border">
          <Tabs
            selectedKey={vista}
            onSelectionChange={k => setVista(k as Vista)}
            className="max-w-3xl mx-auto"
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Secciones" className="w-full !bg-transparent !shadow-none !p-0 !rounded-none">
                {NAV_DUENIO.map(item => (
                  <Tabs.Tab
                    key={item.id}
                    id={item.id}
                    className="flex-1 flex-col gap-0.5 !h-auto py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-[0.68rem] font-semibold"
                  >
                    <Icon icon={item.icon} className="text-xl leading-none" />
                    {item.label}
                    <Tabs.Indicator className="!rounded-none !h-0.5 !bottom-0 !top-auto" />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </nav>
      )}
    </div>
  )
}
