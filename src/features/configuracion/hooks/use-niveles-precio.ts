import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface NivelPrecio {
  id: string
  empresa_id: string
  nombre: string
  orden: number
  porcentaje_defecto: string
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export function useNivelesPrecio() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM niveles_precio WHERE empresa_id = ? ORDER BY orden ASC',
    [empresaId]
  )
  return { niveles: (data ?? []) as NivelPrecio[], isLoading }
}

export function useNivelesPrecioActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM niveles_precio WHERE empresa_id = ? AND is_active = 1 ORDER BY orden ASC',
    [empresaId]
  )
  return { niveles: (data ?? []) as NivelPrecio[], isLoading }
}

export async function crearNivelPrecio(data: {
  nombre: string
  orden: number
  porcentaje_defecto: number
  empresa_id: string
  created_by?: string
}) {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('niveles_precio')
    .values({
      id,
      empresa_id: data.empresa_id,
      nombre: data.nombre.toUpperCase(),
      orden: data.orden,
      porcentaje_defecto: data.porcentaje_defecto.toFixed(2),
      is_active: 1,
      created_at: now,
      updated_at: now,
      created_by: data.created_by ?? null,
      updated_by: null,
    })
    .execute()

  return id
}

export async function actualizarNivelPrecio(
  id: string,
  data: {
    nombre?: string
    porcentaje_defecto?: number
    is_active?: boolean
    updated_by?: string
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.porcentaje_defecto !== undefined)
    updates.porcentaje_defecto = data.porcentaje_defecto.toFixed(2)
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by

  await kysely.updateTable('niveles_precio').set(updates).where('id', '=', id).execute()
}
