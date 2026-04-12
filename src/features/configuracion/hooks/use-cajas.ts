import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Caja {
  id: string
  empresa_id: string
  nombre: string
  ubicacion: string | null
  deposito_id: string | null
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export function useCajas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM cajas WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { cajas: (data ?? []) as Caja[], isLoading }
}

export function useCajasActivas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM cajas WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { cajas: (data ?? []) as Caja[], isLoading }
}

export async function crearCaja(data: {
  nombre: string
  ubicacion?: string
  deposito_id?: string
  empresa_id: string
}) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('cajas')
    .values({
      id,
      nombre: data.nombre.toUpperCase(),
      ubicacion: data.ubicacion ?? null,
      deposito_id: data.deposito_id ?? null,
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarCaja(
  id: string,
  data: {
    nombre?: string
    ubicacion?: string
    deposito_id?: string
    is_active?: boolean
  }
) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.ubicacion !== undefined) updates.ubicacion = data.ubicacion
  if (data.deposito_id !== undefined) updates.deposito_id = data.deposito_id
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0

  await kysely.updateTable('cajas').set(updates).where('id', '=', id).execute()
}
