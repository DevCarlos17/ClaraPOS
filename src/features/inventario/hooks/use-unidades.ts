import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface Unidad {
  id: string
  empresa_id: string
  nombre: string
  abreviatura: string
  es_decimal: number
  is_active: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export function useUnidades() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM unidades WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { unidades: (data ?? []) as Unidad[], isLoading }
}

export function useUnidadesActivas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM unidades WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { unidades: (data ?? []) as Unidad[], isLoading }
}

export async function crearUnidad(data: {
  nombre: string
  abreviatura: string
  es_decimal: boolean
  empresa_id: string
}) {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('unidades')
    .values({
      id,
      nombre: data.nombre.toUpperCase(),
      abreviatura: data.abreviatura.toUpperCase(),
      es_decimal: data.es_decimal ? 1 : 0,
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarUnidad(
  id: string,
  data: {
    nombre?: string
    abreviatura?: string
    es_decimal?: boolean
    is_active?: boolean
    updated_by?: string
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.abreviatura !== undefined) updates.abreviatura = data.abreviatura.toUpperCase()
  if (data.es_decimal !== undefined) updates.es_decimal = data.es_decimal ? 1 : 0
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by

  await kysely.updateTable('unidades').set(updates).where('id', '=', id).execute()
}
