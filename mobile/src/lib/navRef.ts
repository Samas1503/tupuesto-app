import { createNavigationContainerRef } from '@react-navigation/native'

/** ref de navegación global — para abrir pantallas desde listeners fuera del árbol */
export const navRef = createNavigationContainerRef<{ screen?: string; params?: object } & Record<string, object | undefined>>()
