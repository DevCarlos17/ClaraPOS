import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LineaVentaForm, PagoEntryForm } from '../schemas/venta-schema'

export interface FacturaEnEspera {
  id: string
  clienteId: string | null
  clienteNombre: string
  lineas: LineaVentaForm[]
  pagos: PagoEntryForm[]
  tasa: number
  totalUsd: number
  totalBs: number
  itemsCount: number
  usuarioId: string
  usuarioNombre: string
  fecha: string
}

interface FacturasEsperaState {
  facturas: FacturaEnEspera[]
  agregar: (f: FacturaEnEspera) => void
  recuperar: (id: string) => FacturaEnEspera | undefined
  eliminar: (id: string) => void
  limpiar: () => void
}

export const useFacturasEsperaStore = create<FacturasEsperaState>()(
  persist(
    (set, get) => ({
      facturas: [],
      agregar: (f) =>
        set((state) => ({
          facturas: [...state.facturas, f],
        })),
      recuperar: (id) => {
        const state = get()
        const factura = state.facturas.find((f) => f.id === id)
        if (factura) {
          set((s) => ({ facturas: s.facturas.filter((f) => f.id !== id) }))
        }
        return factura
      },
      eliminar: (id) =>
        set((state) => ({
          facturas: state.facturas.filter((f) => f.id !== id),
        })),
      limpiar: () => set({ facturas: [] }),
    }),
    {
      name: 'clarapos-facturas-espera',
    }
  )
)
