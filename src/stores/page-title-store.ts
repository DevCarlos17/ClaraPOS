import { create } from 'zustand'

interface PageTitleState {
  titulo: string
  setTitulo: (titulo: string) => void
}

// Titulo de la pantalla actual, alimentado por PageHeader al montar. Lo consume
// el TopBar para mostrarlo en el header sticky en mobile (donde el PageHeader
// del contenido se oculta). Efimero: no se persiste, se reescribe en cada
// navegacion.
export const usePageTitleStore = create<PageTitleState>((set) => ({
  titulo: '',
  setTitulo: (titulo) => set({ titulo }),
}))
