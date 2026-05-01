import { useQuery as useReactQuery } from '@tanstack/react-query'
import { connector } from '@/core/db/powersync/connector'

export interface CatalogoGlobalItem {
  id: string
  nombre: string
  presentacion: string | null
  maneja_lotes: boolean
  tipo_impuesto: string
  uso_count: number
  similitud: number
}

export function useCatalogoGlobal(query: string) {
  const { data, isLoading } = useReactQuery({
    queryKey: ['catalogo_global', query],
    queryFn: async (): Promise<CatalogoGlobalItem[]> => {
      const { data, error } = await connector.client.rpc('buscar_catalogo_global', {
        p_query: query,
        p_limit: 8,
        p_threshold: 0.15,
      })
      if (error) throw error
      return (data ?? []) as CatalogoGlobalItem[]
    },
    enabled: query.length >= 2 && navigator.onLine,
    staleTime: 5 * 60 * 1000,
  })

  return {
    sugerencias: (data ?? []) as CatalogoGlobalItem[],
    isLoading,
  }
}
