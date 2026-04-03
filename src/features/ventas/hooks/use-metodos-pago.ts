import { useQuery } from '@powersync/react'

export interface MetodoPago {
  id: string
  nombre: string
  moneda: string
  activo: number
  created_at: string
}

export function useMetodosPagoActivos() {
  const { data, isLoading } = useQuery(
    'SELECT * FROM metodos_pago WHERE activo = 1 ORDER BY nombre ASC'
  )
  return { metodos: (data ?? []) as MetodoPago[], isLoading }
}
