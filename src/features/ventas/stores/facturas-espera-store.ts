import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LineaVentaForm, PagoEntryForm } from '../schemas/venta-schema'
import type { CargoEspecial } from '../hooks/use-ventas'

export interface FacturaEnEspera {
  id: string
  clienteId: string | null
  clienteNombre: string
  lineas: LineaVentaForm[]
  pagos: PagoEntryForm[]
  cargosEspeciales: CargoEspecial[]
  tasa: number
  totalUsd: number
  totalBs: number
  itemsCount: number
  usuarioId: string
  usuarioNombre: string
  fecha: string
}

export interface FacturaBorrador {
  clienteId: string | null
  clienteNombre: string
  lineas: LineaVentaForm[]
  pagos: PagoEntryForm[]
  cargosEspeciales: CargoEspecial[]
  tasa: number
  usuarioId: string
  empresaId: string
  ultimaActualizacion: string
}

interface FacturasEsperaState {
  facturas: FacturaEnEspera[]
  borradorActual: FacturaBorrador | null
  agregar: (f: FacturaEnEspera) => void
  recuperar: (id: string) => FacturaEnEspera | undefined
  eliminar: (id: string) => void
  limpiar: () => void
  guardarBorrador: (f: FacturaBorrador) => void
  limpiarBorrador: () => void
}

export const useFacturasEsperaStore = create<FacturasEsperaState>()(
  persist(
    (set, get) => ({
      facturas: [],
      borradorActual: null,
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
      guardarBorrador: (f) => set({ borradorActual: f }),
      limpiarBorrador: () => set({ borradorActual: null }),
    }),
    {
      name: 'clarapos-facturas-espera',
    }
  )
)
