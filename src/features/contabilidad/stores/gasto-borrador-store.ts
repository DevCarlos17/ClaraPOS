import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PagoBorradorRow {
  id: string
  metodo_cobro_id: string
  banco_empresa_id: string
  moneda: 'USD' | 'BS'
  monto: string
  referencia: string
}

export interface GastoBorradorData {
  nroFactura: string
  nroControl: string
  cuentaId: string
  proveedorId: string
  descripcion: string
  fecha: string
  monedaFactura: 'USD' | 'BS'
  usaTasaParalela: boolean
  tasaInterna: string
  tasaInternaManual: boolean
  tasaProveedor: string
  montoFactura: string
  pagos: PagoBorradorRow[]
  observaciones: string
  empresaId: string
  ultimaActualizacion: string
}

interface GastoBorradorState {
  borrador: GastoBorradorData | null
  guardar(data: GastoBorradorData): void
  limpiar(): void
}

export const useGastoBorradorStore = create<GastoBorradorState>()(
  persist(
    (set) => ({
      borrador: null,
      guardar: (data) => set({ borrador: data }),
      limpiar: () => set({ borrador: null }),
    }),
    {
      name: 'clarapos-gasto-borrador',
    }
  )
)
