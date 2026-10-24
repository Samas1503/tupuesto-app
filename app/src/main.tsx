import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { seedIfEmpty } from './db'
import './index.css'
import App from './App.tsx'

registerSW({ immediate: true })

// cuando el SW nuevo toma control → recargar una vez para mostrar la versión nueva
let reloading = false
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (reloading) return
  reloading = true
  location.reload()
})

seedIfEmpty().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
