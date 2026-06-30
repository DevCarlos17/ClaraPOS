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

// ─── Hook filtrado con paginacion (READ-ONLY) ─────────────────

export interface MovCajaFuerteFiltradosResult {
  data: MovCajaFuerte[]
  total: number
  page: number
  totalPages: number
  isLoading: boolean
}

/**
 * Retorna movimientos de caja fuerte filtrados por estado y parametros opcionales.
 * pendiente = validado=0 AND reversado=0
 * historico = validado=1 OR reversado=1 (con filtros opcionales)
 * Soporta paginacion con LIMIT/OFFSET.
 */
export function useMovCajaFuerteFiltrados({
  cajaId,
  estado,
  desde,
  hasta,
  tipo = '',
  search = '',
  page = 1,
  pageSize = 50,
}: {
  cajaId: string
  estado: 'pendiente' | 'historico'
  desde?: string
  hasta?: string
  tipo?: 'INGRESO' | 'EGRESO' | ''
  search?: string
  page?: number
  pageSize?: number
}): MovCajaFuerteFiltradosResult {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const enabled = cajaId !== '' && empresaId !== ''

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
    'caja_fuerte_id = ?',
    estadoClause,
    ...extraClauses,
  ].join(' AND ')

  const baseParams: (string | number)[] = [empresaId, cajaId]
  const allParams = [...baseParams, ...extraParams]
  const offset = (page - 1) * pageSize

  const dataQuery = enabled
    ? `SELECT * FROM mov_caja_fuerte WHERE ${allClauses} ORDER BY fecha ASC, created_at ASC LIMIT ? OFFSET ?`
    : ''
  const countQuery = enabled
    ? `SELECT COUNT(*) as total FROM mov_caja_fuerte WHERE ${allClauses}`
    : ''

  const dataParams = enabled ? ([...allParams, pageSize, offset] as unknown[]) : []
  const countParams = enabled ? (allParams as unknown[]) : []

  const { data: rawData, isLoading: dataLoading } = useQuery(dataQuery, dataParams)
  const { data: countData, isLoading: countLoading } = useQuery(countQuery, countParams)

  const total = ((countData?.[0] as Record<string, unknown> | undefined)?.total as number | undefined) ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    data: (rawData ?? []) as MovCajaFuerte[],
    total,
    page,
    totalPages,
    isLoading: dataLoading || countLoading,
  }
}
