import { useState, useEffect, useCallback } from 'react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'

/**
 * Historial de auditoria del modulo de importacion masiva de productos
 * (Fase B, `import-fase2-audit-log`). A diferencia del resto de hooks de
 * negocio (que usan `useQuery` de `@powersync/react` para una subscripcion
 * reactiva a SQLite local), este hook hace fetch IMPERATIVO via `kysely`
 * (mismo cliente que envuelve PowerSync local, patron idéntico a
 * `getSiguienteNumAjuste` en `use-ajustes.ts`): el historial de imports es
 * reporteria de solo lectura que no necesita reactividad en tiempo real,
 * solo refrescarse al abrir el modal o al pedir "reintentar".
 */

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
  valores_anteriores: string | null
  valores_nuevos: string | null
  errores: string | null
  created_at: string
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
      const rows = await kysely
        .selectFrom('import_log')
        .leftJoin('usuarios', 'usuarios.id', 'import_log.usuario_id')
        .select([
          'import_log.id',
          'import_log.empresa_id',
          'import_log.usuario_id',
          'usuarios.nombre as usuario_nombre',
          'import_log.fecha',
          'import_log.modo',
          'import_log.archivo_nombre',
          'import_log.total_filas',
          'import_log.filas_creadas',
          'import_log.filas_actualizadas',
          'import_log.filas_omitidas',
          'import_log.filas_error',
          'import_log.created_at',
        ])
        .where('import_log.empresa_id', '=', user.empresa_id)
        .orderBy('import_log.fecha', 'desc')
        .limit(100)
        .execute()
      setEntries(rows as ImportLogEntry[])
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

export async function fetchImportLogDet(importLogId: string): Promise<ImportLogDetEntry[]> {
  const rows = await kysely
    .selectFrom('import_log_det')
    .selectAll()
    .where('import_log_id', '=', importLogId)
    .orderBy('fila_num', 'asc')
    .execute()
  return rows as ImportLogDetEntry[]
}
