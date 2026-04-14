import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface MovBancario {
  id: string
  empresa_id: string
  banco_empresa_id: string
  tipo: string
  origen: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  doc_origen_id: string | null
  doc_origen_tipo: string | null
  referencia: string | null
  validado: number
  validado_por: string | null
  validado_at: string | null
  observacion: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

// ─── Hook de lectura (READ-ONLY) ─────────────────────────────

/**
 * Retorna los movimientos bancarios de una cuenta especifica.
 * Filtra opcionalmente por rango de fechas.
 * READ-ONLY: los movimientos se generan automaticamente al registrar operaciones bancarias.
 * El campo `validado` es 0/1 (SQLite boolean).
 */
export function useMovBancarios(
  bancoEmpresaId: string | null,
  fechaDesde?: string,
  fechaHasta?: string
) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hayId = bancoEmpresaId !== null && bancoEmpresaId !== ''
  const hayFiltroFechas = fechaDesde !== undefined || fechaHasta !== undefined

  const query = (() => {
    if (!hayId) return ''

    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return `SELECT * FROM movimientos_bancarios
              WHERE empresa_id = ? AND banco_empresa_id = ?
                AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?
              ORDER BY fecha DESC
              LIMIT 100`
    }

    if (hayFiltroFechas && fechaDesde) {
      return `SELECT * FROM movimientos_bancarios
              WHERE empresa_id = ? AND banco_empresa_id = ?
                AND SUBSTR(fecha, 1, 10) >= ?
              ORDER BY fecha DESC
              LIMIT 100`
    }

    if (hayFiltroFechas && fechaHasta) {
      return `SELECT * FROM movimientos_bancarios
              WHERE empresa_id = ? AND banco_empresa_id = ?
                AND SUBSTR(fecha, 1, 10) <= ?
              ORDER BY fecha DESC
              LIMIT 100`
    }

    return `SELECT * FROM movimientos_bancarios
            WHERE empresa_id = ? AND banco_empresa_id = ?
            ORDER BY fecha DESC
            LIMIT 100`
  })()

  const params = (() => {
    if (!hayId) return []

    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return [empresaId, bancoEmpresaId, fechaDesde, fechaHasta]
    }

    if (hayFiltroFechas && fechaDesde) {
      return [empresaId, bancoEmpresaId, fechaDesde]
    }

    if (hayFiltroFechas && fechaHasta) {
      return [empresaId, bancoEmpresaId, fechaHasta]
    }

    return [empresaId, bancoEmpresaId]
  })()

  const { data, isLoading } = useQuery(query, params)

  return { movimientos: (data ?? []) as MovBancario[], isLoading }
}
