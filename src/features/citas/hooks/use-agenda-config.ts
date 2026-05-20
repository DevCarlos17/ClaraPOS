import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { localNow } from '@/lib/dates'

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
  const rows = await db.getAll<{ config: string }>(
    'SELECT config FROM empresas WHERE id = ?',
    [empresaId]
  )

  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(rows[0]?.config ?? '{}')
  } catch {
    // keep empty object
  }

  const existingAgenda = (parsed.agenda as object | undefined) ?? {}
  parsed.agenda = { ...existingAgenda, ...updates }

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      'UPDATE empresas SET config = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(parsed), localNow(), empresaId]
    )
  })
}
