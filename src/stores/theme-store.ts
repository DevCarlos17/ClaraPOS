import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeId = 'clara' | 'jade' | 'rosa' | 'violeta' | 'ambar'

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
]

interface ThemeState {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute('data-theme', theme)
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
