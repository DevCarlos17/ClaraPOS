import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface MovCajaFuerte {
  id: string
  empresa_id: string
  caja_fuerte_id: string
  tipo: string
  origen: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  doc_origen_id: string | null
  doc_origen_tipo: string | null
  referencia: string | null
  descripcion: string | null
  validado: number
  validado_por: string | null
  validado_at: string | null
  reversado: number
  reverso_de: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

// ─── Hook de lectura (READ-ONLY) ─────────────────────────────

export function useMovCajaFuerte(
  cajaFuerteId: string | null,
  fechaDesde?: string,
  fechaHasta?: string
) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hayId = cajaFuerteId !== null && cajaFuerteId !== ''
  const hayFiltroFechas = fechaDesde !== undefined || fechaHasta !== undefined

  const query = (() => {
    if (!hayId) return ''

    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return `SELECT * FROM mov_caja_fuerte
              WHERE empresa_id = ? AND caja_fuerte_id = ?
                AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?
              ORDER BY fecha DESC, created_at DESC
              LIMIT 100`
    }

    if (hayFiltroFechas && fechaDesde) {
      return `SELECT * FROM mov_caja_fuerte
              WHERE empresa_id = ? AND caja_fuerte_id = ?
                AND SUBSTR(fecha, 1, 10) >= ?
              ORDER BY fecha DESC, created_at DESC
              LIMIT 100`
    }

    if (hayFiltroFechas && fechaHasta) {
      return `SELECT * FROM mov_caja_fuerte
              WHERE empresa_id = ? AND caja_fuerte_id = ?
                AND SUBSTR(fecha, 1, 10) <= ?
              ORDER BY fecha DESC, created_at DESC
              LIMIT 100`
    }

    return `SELECT * FROM mov_caja_fuerte
            WHERE empresa_id = ? AND caja_fuerte_id = ?
            ORDER BY fecha DESC, created_at DESC
            LIMIT 100`
  })()

  const params = (() => {
    if (!hayId) return []

    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return [empresaId, cajaFuerteId, fechaDesde, fechaHasta]
    }
    if (hayFiltroFechas && fechaDesde) {
      return [empresaId, cajaFuerteId, fechaDesde]
    }
    if (hayFiltroFechas && fechaHasta) {
      return [empresaId, cajaFuerteId, fechaHasta]
    }

    return [empresaId, cajaFuerteId]
  })()

  const { data, isLoading } = useQuery(query, params)

  return { movimientos: (data ?? []) as MovCajaFuerte[], isLoading }
}
