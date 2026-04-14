import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface Deposito {
  id: string
  empresa_id: string
  nombre: string
  direccion: string | null
  es_principal: number
  permite_venta: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export function useDepositos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM depositos WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { depositos: (data ?? []) as Deposito[], isLoading }
}

export function useDepositosActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM depositos WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { depositos: (data ?? []) as Deposito[], isLoading }
}

export async function crearDeposito(data: {
  nombre: string
  direccion?: string
  es_principal: boolean
  permite_venta: boolean
  empresa_id: string
  created_by?: string
}) {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('depositos')
    .values({
      id,
      nombre: data.nombre.toUpperCase(),
      direccion: data.direccion ?? null,
      es_principal: data.es_principal ? 1 : 0,
      permite_venta: data.permite_venta ? 1 : 0,
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
      created_by: data.created_by ?? null,
    })
    .execute()

  return id
}

export async function actualizarDeposito(
  id: string,
  data: {
    nombre?: string
    direccion?: string
    es_principal?: boolean
    permite_venta?: boolean
    is_active?: boolean
    updated_by?: string
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.direccion !== undefined) updates.direccion = data.direccion
  if (data.es_principal !== undefined) updates.es_principal = data.es_principal ? 1 : 0
  if (data.permite_venta !== undefined) updates.permite_venta = data.permite_venta ? 1 : 0
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by

  await kysely.updateTable('depositos').set(updates).where('id', '=', id).execute()
}
