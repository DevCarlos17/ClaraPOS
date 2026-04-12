import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Impuesto {
  id: string
  empresa_id: string
  nombre: string
  tipo_tributo: string
  porcentaje: string
  codigo_seniat: string | null
  descripcion: string | null
  is_active: number
  created_at: string
  updated_at: string
  updated_by: string | null
}

export function useImpuestos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM impuestos_ve WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { impuestos: (data ?? []) as Impuesto[], isLoading }
}

export function useImpuestosActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM impuestos_ve WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { impuestos: (data ?? []) as Impuesto[], isLoading }
}

export async function crearImpuesto(data: {
  nombre: string
  tipo_tributo: string
  porcentaje: number
  codigo_seniat?: string
  descripcion?: string
  empresa_id: string
}) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('impuestos_ve')
    .values({
      id,
      nombre: data.nombre.toUpperCase(),
      tipo_tributo: data.tipo_tributo,
      porcentaje: data.porcentaje.toFixed(2),
      codigo_seniat: data.codigo_seniat ?? null,
      descripcion: data.descripcion ?? null,
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarImpuesto(
  id: string,
  data: {
    nombre?: string
    tipo_tributo?: string
    porcentaje?: number
    codigo_seniat?: string
    descripcion?: string
    is_active?: boolean
    updated_by?: string
  }
) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.tipo_tributo !== undefined) updates.tipo_tributo = data.tipo_tributo
  if (data.porcentaje !== undefined) updates.porcentaje = data.porcentaje.toFixed(2)
  if (data.codigo_seniat !== undefined) updates.codigo_seniat = data.codigo_seniat
  if (data.descripcion !== undefined) updates.descripcion = data.descripcion
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by

  await kysely.updateTable('impuestos_ve').set(updates).where('id', '=', id).execute()
}
