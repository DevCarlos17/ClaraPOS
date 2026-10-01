import { useState, useEffect, useCallback } from 'react'
import { connector } from '@/core/db/powersync/connector'
import { useCurrentUser } from '@/core/hooks/use-current-user'

/**
 * Historial de auditoria del modulo de importacion masiva de productos
 * (Fase B + fix de paginacion). La lectura va DIRECTO a Supabase via
 * `connector.client` (NO PowerSync local): el log de imports es reporteria de
 * solo lectura que puede ser voluminosa (cientos de filas de detalle con
 * blobs JSON por import). Mantenerla fuera de PowerSync evita:
 *   1. Inflar la cola de sync local con cientos de filas por import.
 *   2. Colgar la app al traer TODO el detalle de golpe (se pagina de a 50).
 * `import_log` e `import_log_det` NO estan en el schema PowerSync ni en las
 * sync rules — solo viven en Supabase.
 */

export const IMPORT_LOG_DET_PAGE_SIZE = 50

export interface ImportLogEntry {
  id: string
  empresa_id: string
  usuario_id: string
  usuario_nombre: string | null
  fecha: string
  modo: string
  archivo_nombre: string | null
  total_filas: number
  filas_creadas: number
  filas_actualizadas: number
  filas_omitidas: number
  filas_error: number
  created_at: string
}

export interface ImportLogDetEntry {
  id: string
  import_log_id: string
  empresa_id: string
  fila_num: number
  codigo: string | null
  nombre: string | null
  tipo: string | null
  accion: string
  /** JSONB — supabase-js lo devuelve ya parseado como objeto (no string). */
  valores_anteriores: Record<string, unknown> | null
  /** JSONB — supabase-js lo devuelve ya parseado como objeto (no string). */
  valores_nuevos: Record<string, unknown> | null
  /** JSONB — supabase-js lo devuelve ya parseado como array (no string). */
  errores: string[] | null
  created_at: string
}

interface ImportLogRowSupabase {
  id: string
  empresa_id: string
  usuario_id: string
  fecha: string
  modo: string
  archivo_nombre: string | null
  total_filas: number
  filas_creadas: number
  filas_actualizadas: number
  filas_omitidas: number
  filas_error: number
  created_at: string
  usuarios: { nombre: string | null } | null
}

export function useImportLog() {
  const { user } = useCurrentUser()
  const [entries, setEntries] = useState<ImportLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!user?.empresa_id) return
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: queryError } = await connector.client
        .from('import_log')
        .select('*, usuarios(nombre)')
        .eq('empresa_id', user.empresa_id)
        .order('fecha', { ascending: false })
        .limit(50)
        .returns<ImportLogRowSupabase[]>()

      if (queryError) throw queryError

      // Aplanar el join anidado usuarios(nombre) -> usuario_nombre
      const mapped: ImportLogEntry[] = (data ?? []).map((row) => ({
        id: row.id,
        empresa_id: row.empresa_id,
        usuario_id: row.usuario_id,
        usuario_nombre: row.usuarios?.nombre ?? null,
        fecha: row.fecha,
        modo: row.modo,
        archivo_nombre: row.archivo_nombre,
        total_filas: row.total_filas,
        filas_creadas: row.filas_creadas,
        filas_actualizadas: row.filas_actualizadas,
        filas_omitidas: row.filas_omitidas,
        filas_error: row.filas_error,
        created_at: row.created_at,
      }))
      setEntries(mapped)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar historial')
    } finally {
      setIsLoading(false)
    }
  }, [user?.empresa_id])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { entries, isLoading, error, refetch }
}

/**
 * Trae UNA pagina del detalle de un import (de a `IMPORT_LOG_DET_PAGE_SIZE`
 * filas), directo a Supabase. `page` es 0-based. El llamador acumula paginas
 * y decide si pedir mas en base a si la ultima pagina vino llena.
 */
export async function fetchImportLogDet(
  importLogId: string,
  page = 0
): Promise<ImportLogDetEntry[]> {
  const from = page * IMPORT_LOG_DET_PAGE_SIZE
  const to = from + IMPORT_LOG_DET_PAGE_SIZE - 1

  const { data, error } = await connector.client
    .from('import_log_det')
    .select(
      'id, import_log_id, empresa_id, fila_num, codigo, nombre, tipo, accion, valores_anteriores, valores_nuevos, errores, created_at'
    )
    .eq('import_log_id', importLogId)
    .order('fila_num', { ascending: true })
    .range(from, to)
    .returns<ImportLogDetEntry[]>()

  if (error) throw error
  return data ?? []
}
