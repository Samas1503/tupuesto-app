/** Tema TuPuesto — paleta de la app web (index.css) portada a RN.
 *  El accent cambia según la categoría del dueño (data-tema en web). */

import { createContext, useContext } from 'react'
import type { Categoria } from './types'

export const C = {
  navy: '#0a2540',
  blurple: '#635bff',
  paper: '#f6f9fc',
  surface: '#ffffff',
  surfaceSecondary: '#f6f9fc',
  surfaceTertiary: '#eef3f8',
  muted: '#425466',
  border: '#e6ebf1',
  success: '#0f6b3a',
  warning: '#f59e42',
  warningText: '#4a2c00',
  danger: '#b84900',
  vizTrack: '#e8eef5',
  vizCash: '#0f6b3a',
  vizQr: '#00d4ff',
  white: '#ffffff',
} as const

/** accent por categoría — igual que [data-tema] en index.css */
export const ACCENT_POR_CATEGORIA: Record<Categoria, string> = {
  comida: '#e07a2f',
  postres: '#e04f9f',
  ropa: '#8b5cf6',
  mercaderia: '#0ea5e9',
  juguetes: '#f59e0b',
  otro: '#635bff',
}

export const accentDe = (c?: string) =>
  ACCENT_POR_CATEGORIA[(c as Categoria) ?? 'otro'] ?? C.blurple

/** contexto del accent activo — lo provee App según la categoría del dueño */
export const AccentContext = createContext<string>(C.blurple)
export const useAccent = () => useContext(AccentContext)
