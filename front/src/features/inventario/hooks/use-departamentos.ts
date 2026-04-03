import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { v4 as uuidv4 } from 'uuid'

export interface Departamento {
  id: string
  codigo: string
  nombre: string
  activo: number
  created_at: string
  updated_at: string
}

export function useDepartamentos() {
  const { data, isLoading } = useQuery('SELECT * FROM departamentos ORDER BY nombre ASC')
  return { departamentos: (data ?? []) as Departamento[], isLoading }
}

export function useDepartamentosActivos() {
  const { data, isLoading } = useQuery(
    'SELECT * FROM departamentos WHERE activo = 1 ORDER BY nombre ASC'
  )
  return { departamentos: (data ?? []) as Departamento[], isLoading }
}

export async function crearDepartamento(codigo: string, nombre: string) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('departamentos')
    .values({
      id,
      codigo: codigo.toUpperCase(),
      nombre: nombre.toUpperCase(),
      activo: 1,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarDepartamento(
  id: string,
  data: { nombre?: string; activo?: boolean }
) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.activo !== undefined) updates.activo = data.activo ? 1 : 0

  await kysely.updateTable('departamentos').set(updates).where('id', '=', id).execute()
}

export async function tieneProductosActivos(departamentoId: string): Promise<boolean> {
  const result = await kysely
    .selectFrom('productos')
    .select(kysely.fn.count('id').as('count'))
    .where('departamento_id', '=', departamentoId)
    .where('activo', '=', 1)
    .executeTakeFirst()

  return Number(result?.count ?? 0) > 0
}
