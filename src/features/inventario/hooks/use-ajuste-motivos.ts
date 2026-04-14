import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface AjusteMotivo {
  id: string
  empresa_id: string
  nombre: string
  es_sistema: number
  operacion_base: string
  afecta_costo: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export function useAjusteMotivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM ajuste_motivos WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { motivos: (data ?? []) as AjusteMotivo[], isLoading }
}

export function useAjusteMotivosActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM ajuste_motivos WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { motivos: (data ?? []) as AjusteMotivo[], isLoading }
}

export async function crearAjusteMotivo(data: {
  nombre: string
  operacion_base: string
  afecta_costo: boolean
  empresa_id: string
  created_by?: string
}) {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('ajuste_motivos')
    .values({
      id,
      nombre: data.nombre.toUpperCase(),
      es_sistema: 0,
      operacion_base: data.operacion_base,
      afecta_costo: data.afecta_costo ? 1 : 0,
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
      created_by: data.created_by ?? null,
    })
    .execute()

  return id
}

export async function actualizarAjusteMotivo(
  id: string,
  data: {
    nombre?: string
    operacion_base?: string
    afecta_costo?: boolean
    is_active?: boolean
    updated_by?: string
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.operacion_base !== undefined) updates.operacion_base = data.operacion_base
  if (data.afecta_costo !== undefined) updates.afecta_costo = data.afecta_costo ? 1 : 0
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by

  await kysely.updateTable('ajuste_motivos').set(updates).where('id', '=', id).execute()
}
