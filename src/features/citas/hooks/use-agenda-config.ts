import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { localNow } from '@/lib/dates'
import { readConfigNamespace, serializeConfigNamespace } from '@/features/configuracion/hooks/use-company'

export interface AgendaConfig {
  mostrar_agenda: boolean
  limite_futuro_dias: number // 0 = sin limite
  rango_grilla_default: 'dia' | 'semana' | 'mes'
  duracion_slot_default: number // 15 | 30 | 45 | 60 min
  permitir_solapamiento_descanso: boolean
  tolerancia_noshow_min: number // minutos despues de fecha_inicio para marcar NO_SHOW (0 = desactivado)
  manejo_descanso_invadido: 'DESPLAZAR' | 'TIEMPO_EXTRA'
  inicio_semana: 'lunes' | 'domingo'
}

const DEFAULTS: AgendaConfig = {
  mostrar_agenda: true,
  limite_futuro_dias: 30,
  rango_grilla_default: 'semana',
  duracion_slot_default: 30,
  permitir_solapamiento_descanso: false,
  tolerancia_noshow_min: 30,
  manejo_descanso_invadido: 'DESPLAZAR',
  inicio_semana: 'lunes',
}

/**
 * Lee el namespace `agenda` de `empresas.config` via el helper corruption-proof
 * compartido con `use-company.ts` (`readConfigNamespace`). Esto sanea/auto-repara
 * el mismo patron de corrupcion (char-indexed / doble codificacion) que afecta a
 * `moneda_presentacion_documentos` en la misma columna, en vez de caer a `{}` y
 * perder silenciosamente la configuracion de agenda existente.
 */
export function parseAgendaConfig(configStr: string): AgendaConfig {
  return readConfigNamespace(configStr, 'agenda', DEFAULTS)
}

export function useAgendaConfig() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    empresaId ? 'SELECT config FROM empresas WHERE id = ?' : '',
    empresaId ? [empresaId] : []
  )

  const row = (data ?? [])[0] as { config: string } | undefined
  const config = parseAgendaConfig(row?.config ?? '{}')

  return {
    config,
    mostrarAgenda: config.mostrar_agenda,
    isLoading,
    empresaId,
  }
}

/**
 * Persiste `updates` sobre el namespace `agenda` de `empresas.config` via el mismo
 * camino corruption-proof que `serializeEmpresaConfig` usa para las claves tipadas
 * de `EmpresaConfig` (`serializeConfigNamespace`, compartido en `use-company.ts`).
 * Al leer con `sanitizeConfigRecord` internamente, un config ya corrupto se
 * auto-repara: preserva el `agenda` preexistente Y cualquier otro namespace (ej.
 * `moneda_presentacion_documentos`) en vez de dropearlos, y descarta las claves
 * numericas de corrupcion en cada escritura para que la fila nunca vuelva a crecer.
 */
export async function guardarAgendaConfig(
  empresaId: string,
  updates: Partial<AgendaConfig>
): Promise<void> {
  const rows = await db.getAll<{ config: string }>(
    'SELECT config FROM empresas WHERE id = ?',
    [empresaId]
  )

  const newConfig = serializeConfigNamespace(rows[0]?.config ?? null, 'agenda', updates)

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      'UPDATE empresas SET config = ?, updated_at = ? WHERE id = ?',
      [newConfig, localNow(), empresaId]
    )
  })
}
