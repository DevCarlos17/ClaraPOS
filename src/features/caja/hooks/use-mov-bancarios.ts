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
  reversado: number
  reverso_de: string | null
  descripcion: string | null
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

// ─── Hook filtrado con paginacion (READ-ONLY) ─────────────────

export interface MovBancariosFiltradosResult {
  data: MovBancario[]
  total: number
  page: number
  totalPages: number
  isLoading: boolean
}

/**
 * Retorna movimientos bancarios filtrados por estado y parametros opcionales.
 * pendiente = validado=0 AND reversado=0
 * historico = validado=1 OR reversado=1 (con filtros opcionales de fecha/tipo/busqueda)
 * Soporta paginacion con LIMIT/OFFSET.
 */
export function useMovBancariosFiltrados({
  bancoId,
  estado,
  desde,
  hasta,
  tipo = '',
  search = '',
  page = 1,
  pageSize = 50,
}: {
  bancoId: string
  estado: 'pendiente' | 'historico'
  desde?: string
  hasta?: string
  tipo?: 'INGRESO' | 'EGRESO' | ''
  search?: string
  page?: number
  pageSize?: number
}): MovBancariosFiltradosResult {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const enabled = bancoId !== '' && empresaId !== ''

  const estadoClause =
    estado === 'pendiente'
      ? 'validado = 0 AND reversado = 0'
      : '(validado = 1 OR reversado = 1)'

  const extraClauses: string[] = []
  const extraParams: (string | number)[] = []

  if (estado === 'historico' && desde) {
    extraClauses.push("SUBSTR(fecha, 1, 10) >= ?")
    extraParams.push(desde)
  }
  if (estado === 'historico' && hasta) {
    extraClauses.push("SUBSTR(fecha, 1, 10) <= ?")
    extraParams.push(hasta)
  }
  if (tipo) {
    extraClauses.push('tipo = ?')
    extraParams.push(tipo)
  }
  if (search && search.trim() !== '') {
    extraClauses.push('(referencia LIKE ? OR descripcion LIKE ?)')
    extraParams.push(`%${search.trim()}%`, `%${search.trim()}%`)
  }

  const allClauses = [
    'empresa_id = ?',
    'banco_empresa_id = ?',
    estadoClause,
    ...extraClauses,
  ].join(' AND ')

  const baseParams: (string | number)[] = [empresaId, bancoId]
  const allParams = [...baseParams, ...extraParams]
  const offset = (page - 1) * pageSize

  const dataQuery = enabled
    ? `SELECT * FROM movimientos_bancarios WHERE ${allClauses} ORDER BY fecha ASC, created_at ASC LIMIT ? OFFSET ?`
    : ''
  const countQuery = enabled
    ? `SELECT COUNT(*) as total FROM movimientos_bancarios WHERE ${allClauses}`
    : ''

  const dataParams = enabled ? ([...allParams, pageSize, offset] as unknown[]) : []
  const countParams = enabled ? (allParams as unknown[]) : []

  const { data: rawData, isLoading: dataLoading } = useQuery(dataQuery, dataParams)
  const { data: countData, isLoading: countLoading } = useQuery(countQuery, countParams)

  const total = ((countData?.[0] as Record<string, unknown> | undefined)?.total as number | undefined) ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    data: (rawData ?? []) as MovBancario[],
    total,
    page,
    totalPages,
    isLoading: dataLoading || countLoading,
  }
}
