import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface MovMetodoCobro {
  id: string
  empresa_id: string
  metodo_cobro_id: string
  tipo: string
  origen: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  doc_origen_id: string | null
  doc_origen_ref: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

// ─── Hook de lectura (READ-ONLY) ─────────────────────────────

/**
 * Retorna los movimientos de un metodo de cobro especifico.
 * Filtra opcionalmente por rango de fechas.
 * READ-ONLY: los movimientos se generan automaticamente al registrar ventas/pagos.
 */
export function useMovMetodoCobro(
  metodoCobroId: string | null,
  fechaDesde?: string,
  fechaHasta?: string
) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hayFiltroFechas = fechaDesde !== undefined || fechaHasta !== undefined
  const hayId = metodoCobroId !== null && metodoCobroId !== ''

  // Construir query segun los filtros activos
  const query = (() => {
    if (!hayId) return ''

    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return `SELECT * FROM movimientos_metodo_cobro
              WHERE empresa_id = ? AND metodo_cobro_id = ?
                AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?
              ORDER BY fecha DESC
              LIMIT 100`
    }

    if (hayFiltroFechas && fechaDesde) {
      return `SELECT * FROM movimientos_metodo_cobro
              WHERE empresa_id = ? AND metodo_cobro_id = ?
                AND SUBSTR(fecha, 1, 10) >= ?
              ORDER BY fecha DESC
              LIMIT 100`
    }

    if (hayFiltroFechas && fechaHasta) {
      return `SELECT * FROM movimientos_metodo_cobro
              WHERE empresa_id = ? AND metodo_cobro_id = ?
                AND SUBSTR(fecha, 1, 10) <= ?
              ORDER BY fecha DESC
              LIMIT 100`
    }

    return `SELECT * FROM movimientos_metodo_cobro
            WHERE empresa_id = ? AND metodo_cobro_id = ?
            ORDER BY fecha DESC
            LIMIT 100`
  })()

  const params = (() => {
    if (!hayId) return []

    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return [empresaId, metodoCobroId, fechaDesde, fechaHasta]
    }

    if (hayFiltroFechas && fechaDesde) {
      return [empresaId, metodoCobroId, fechaDesde]
    }

    if (hayFiltroFechas && fechaHasta) {
      return [empresaId, metodoCobroId, fechaHasta]
    }

    return [empresaId, metodoCobroId]
  })()

  const { data, isLoading } = useQuery(query, params)

  return { movimientos: (data ?? []) as MovMetodoCobro[], isLoading }
}
