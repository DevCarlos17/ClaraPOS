import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type MonedaContable = 'USD' | 'BS'

export const MONEDA_CONTABLE_STORE_KEY = 'clarapos-moneda-contable'

interface MonedaContableState {
  monedas: Record<string, MonedaContable>
  setMoneda: (empresaId: string, moneda: MonedaContable) => void
}

export const useMonedaContableStore = create<MonedaContableState>()(
  persist(
    (set) => ({
      monedas: {},
      setMoneda: (empresaId, moneda) =>
        set((s) => ({ monedas: { ...s.monedas, [empresaId]: moneda } })),
    }),
    {
      name: MONEDA_CONTABLE_STORE_KEY,
      partialize: (s) => ({ monedas: s.monedas }),
    }
  )
)

/**
 * Lee la moneda contable directamente desde localStorage.
 * Seguro para usar fuera de React (dentro de transacciones DB, etc.).
 */
export function getMonedaContable(empresaId: string): MonedaContable {
  try {
    const stored = localStorage.getItem(MONEDA_CONTABLE_STORE_KEY)
    if (!stored) return 'USD'
    const parsed = JSON.parse(stored) as { state?: { monedas?: Record<string, string> } }
    return parsed.state?.monedas?.[empresaId] === 'BS' ? 'BS' : 'USD'
  } catch {
    return 'USD'
  }
}
