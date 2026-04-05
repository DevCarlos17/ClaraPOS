import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Receta {
  id: string
  servicio_id: string
  producto_id: string
  cantidad: string
  created_at: string
}

export function useRecetasPorServicio(servicioId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM recetas WHERE empresa_id = ? AND servicio_id = ? ORDER BY created_at ASC',
    [empresaId, servicioId]
  )
  return { recetas: (data ?? []) as Receta[], isLoading }
}

export async function agregarIngrediente(
  servicioId: string,
  productoId: string,
  cantidad: number,
  empresaId: string
) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('recetas')
    .values({
      id,
      servicio_id: servicioId,
      producto_id: productoId,
      cantidad: cantidad.toFixed(3),
      empresa_id: empresaId,
      created_at: now,
    })
    .execute()

  return id
}

export async function actualizarCantidadReceta(id: string, cantidad: number) {
  await kysely
    .updateTable('recetas')
    .set({ cantidad: cantidad.toFixed(3) })
    .where('id', '=', id)
    .execute()
}

export async function eliminarIngrediente(id: string) {
  await kysely.deleteFrom('recetas').where('id', '=', id).execute()
}
