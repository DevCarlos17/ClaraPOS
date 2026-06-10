import { usePowerSync } from '@powersync/react'
import { useQuery } from '@tanstack/react-query'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export interface ErrorContabilidad {
  id: string
  tabla_origen: string
  doc_origen_id: string
  error_msg: string
  created_at: string
}

export function useErroresContabilidad() {
  const db = usePowerSync()
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  return useQuery({
    queryKey: ['errores-contabilidad', empresaId],
    queryFn: async () => {
      if (!empresaId) return []
      const result = await db.getAll<ErrorContabilidad>(
        `SELECT id, tabla_origen, doc_origen_id, error_msg, created_at
         FROM errores_contabilidad
         WHERE empresa_id = ?
         ORDER BY created_at DESC
         LIMIT 50`,
        [empresaId]
      )
      return result
    },
    enabled: !!empresaId,
    staleTime: 30_000,
  })
}

export function useContabilidadPendiente() {
  const db = usePowerSync()
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  return useQuery({
    queryKey: ['contabilidad-pendiente-count', empresaId],
    queryFn: async () => {
      if (!empresaId) return 0
      const ventasRes = await db.getOptional<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM ventas WHERE empresa_id = ? AND contabilidad_ok = 0 AND status = 'ACTIVA'`,
        [empresaId]
      )
      const comprasRes = await db.getOptional<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM facturas_compra WHERE empresa_id = ? AND contabilidad_ok = 0`,
        [empresaId]
      )
      return (Number(ventasRes?.cnt ?? 0)) + (Number(comprasRes?.cnt ?? 0))
    },
    enabled: !!empresaId,
    staleTime: 60_000,
  })
}
