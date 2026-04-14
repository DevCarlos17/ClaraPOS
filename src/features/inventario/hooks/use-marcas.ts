import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface Marca {
  id: string
  empresa_id: string
  nombre: string
  descripcion: string | null
  logo_url: string | null
  is_active: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export function useMarcas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM marcas WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { marcas: (data ?? []) as Marca[], isLoading }
}

export function useMarcasActivas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM marcas WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { marcas: (data ?? []) as Marca[], isLoading }
}

export async function crearMarca(data: {
  nombre: string
  descripcion?: string
  empresa_id: string
}) {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('marcas')
    .values({
      id,
      nombre: data.nombre.toUpperCase(),
      descripcion: data.descripcion ?? null,
      logo_url: null,
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarMarca(
  id: string,
  data: {
    nombre?: string
    descripcion?: string
    is_active?: boolean
    updated_by?: string
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.descripcion !== undefined) updates.descripcion = data.descripcion
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by

  await kysely.updateTable('marcas').set(updates).where('id', '=', id).execute()
}
