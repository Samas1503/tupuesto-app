import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/app/',
  server: {
    proxy: { '/api': 'http://localhost:3000' }, // api/ corre en `vercel dev` (raíz)
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TuPuesto — Control de puestos',
        short_name: 'TuPuesto',
        description: 'Rendición diaria de puestos: el vendedor cuenta al cerrar, vos ves si falta o sobra.',
        lang: 'es-AR',
        theme_color: '#0a2540',
        background_color: '#f6f9fc',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/kioskpay-ios-light-512x512.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
