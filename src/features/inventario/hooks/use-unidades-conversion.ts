import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface UnidadConversion {
  id: string
  empresa_id: string
  unidad_mayor_id: string
  unidad_menor_id: string
  factor: string
  is_active: number
  created_at: string
  updated_at: string
}

export function useConversiones() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT uc.*,
       um.nombre AS nombre_mayor, um.abreviatura AS abreviatura_mayor,
       un.nombre AS nombre_menor, un.abreviatura AS abreviatura_menor
     FROM unidades_conversion uc
     LEFT JOIN unidades um ON um.id = uc.unidad_mayor_id
     LEFT JOIN unidades un ON un.id = uc.unidad_menor_id
     WHERE uc.empresa_id = ?
     ORDER BY um.nombre ASC`,
    [empresaId]
  )
  return { conversiones: (data ?? []) as (UnidadConversion & {
    nombre_mayor: string | null
    abreviatura_mayor: string | null
    nombre_menor: string | null
    abreviatura_menor: string | null
  })[], isLoading }
}

export async function crearConversion(data: {
  unidad_mayor_id: string
  unidad_menor_id: string
  factor: number
  empresa_id: string
}) {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('unidades_conversion')
    .values({
      id,
      unidad_mayor_id: data.unidad_mayor_id,
      unidad_menor_id: data.unidad_menor_id,
      factor: data.factor.toFixed(4),
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarConversion(
  id: string,
  data: {
    unidad_mayor_id?: string
    unidad_menor_id?: string
    factor?: number
    is_active?: boolean
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.unidad_mayor_id !== undefined) updates.unidad_mayor_id = data.unidad_mayor_id
  if (data.unidad_menor_id !== undefined) updates.unidad_menor_id = data.unidad_menor_id
  if (data.factor !== undefined) updates.factor = data.factor.toFixed(4)
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0

  await kysely.updateTable('unidades_conversion').set(updates).where('id', '=', id).execute()
}
