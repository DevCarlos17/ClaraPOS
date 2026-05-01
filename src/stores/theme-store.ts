import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeId = 'clara' | 'jade' | 'rosa' | 'violeta' | 'ambar' | 'blanco' | 'negro'

export interface ThemeDef {
  id: ThemeId
  name: string
  color: string
}

export const THEMES: ThemeDef[] = [
  { id: 'clara',   name: 'Clara',   color: '#2563eb' },
  { id: 'jade',    name: 'Jade',    color: '#059669' },
  { id: 'rosa',    name: 'Rosa',    color: '#db2777' },
  { id: 'violeta', name: 'Violeta', color: '#7c3aed' },
  { id: 'ambar',   name: 'Ámbar',   color: '#d97706' },
  { id: 'blanco',  name: 'Blanco',  color: '#e2e8f0' },
  { id: 'negro',   name: 'Negro',   color: '#1e293b' },
]

interface ThemeState {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

function applyTheme(theme: ThemeId) {
  const color = THEMES.find((t) => t.id === theme)?.color ?? '#2563eb'
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'clara',
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
    }),
    {
      name: 'clarapos-theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    }
  )
)
