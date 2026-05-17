import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export interface AgendaConfig {
  mostrar_agenda: boolean
  limite_futuro_dias: number // 0 = sin limite
  rango_grilla_default: 'dia' | 'semana' | 'mes'
  duracion_slot_default: number // 15 | 30 | 45 | 60 min
  permitir_solapamiento_descanso: boolean
}

const DEFAULTS: AgendaConfig = {
  mostrar_agenda: true,
  limite_futuro_dias: 30,
  rango_grilla_default: 'semana',
  duracion_slot_default: 30,
  permitir_solapamiento_descanso: false,
}

function parseAgendaConfig(configStr: string): AgendaConfig {
  try {
    const raw = JSON.parse(configStr)
    const agenda = (raw?.agenda ?? {}) as Partial<AgendaConfig>
    return { ...DEFAULTS, ...agenda }
  } catch {
    return { ...DEFAULTS }
  }
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

export async function guardarAgendaConfig(
  empresaId: string,
  updates: Partial<AgendaConfig>
): Promise<void> {
  const row = await kysely
    .selectFrom('empresas')
    .select('config')
    .where('id', '=', empresaId)
    .executeTakeFirst()

  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(row?.config ?? '{}')
  } catch {
    // keep empty object
  }

  const existingAgenda = (parsed.agenda as object | undefined) ?? {}
  parsed.agenda = { ...existingAgenda, ...updates }

  await kysely
    .updateTable('empresas')
    .set({ config: JSON.stringify(parsed) })
    .where('id', '=', empresaId)
    .execute()
}
