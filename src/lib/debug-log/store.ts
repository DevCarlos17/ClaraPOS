import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface DebugEvento {
  id: string
  timestamp: string
  usuarioEmail: string | null
  empresaId: string | null
  accion: string
  nivel: 'info' | 'ok' | 'error'
  detalle: Record<string, unknown> | null
}

interface DebugLogContext {
  usuarioEmail: string | null
  empresaId: string | null
}

interface DebugLogState {
  eventos: DebugEvento[]
  _context: DebugLogContext
  push: (evento: DebugEvento) => void
  clear: () => void
  setContexto: (ctx: DebugLogContext) => void
}

const MAX_EVENTOS = 2000

export const useDebugLogStore = create<DebugLogState>()(
  persist(
    (set) => ({
      eventos: [],
      _context: { usuarioEmail: null, empresaId: null },

      push: (evento) =>
        set((state) => {
          const next = [evento, ...state.eventos]
          return { eventos: next.length > MAX_EVENTOS ? next.slice(0, MAX_EVENTOS) : next }
        }),

      clear: () => set({ eventos: [] }),

      setContexto: (ctx) => set({ _context: ctx }),
    }),
    {
      name: 'clarapos-debug-log',
      partialize: (state) => ({ eventos: state.eventos }),
    }
  )
)
