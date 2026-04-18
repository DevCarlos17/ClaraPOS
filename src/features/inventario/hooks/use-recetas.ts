import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { actualizarCostoCombo } from './use-productos'

export interface Receta {
  id: string
  servicio_id: string
  producto_id: string
  cantidad: string
  created_at: string
}

export interface RecetaConProducto extends Receta {
  producto_nombre: string
  producto_codigo: string
  producto_costo_usd: string
  producto_stock: string
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

export function useTodasLasRecetas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM recetas WHERE empresa_id = ? ORDER BY servicio_id, created_at ASC',
    [empresaId]
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
  const now = localNow()

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

export function recalcularCostoCombo(
  comboId: string,
  recetas: Receta[],
  productosMap: Map<string, { costo_usd: string }>
): Promise<void> {
  let total = 0
  for (const receta of recetas) {
    const prod = productosMap.get(receta.producto_id)
    if (prod) {
      total += parseFloat(prod.costo_usd) * parseFloat(receta.cantidad)
    }
  }
  return actualizarCostoCombo(comboId, total)
}

export function calcularDisponibilidadCombo(
  recetas: Receta[],
  productosMap: Map<string, { stock: string }>
): number {
  if (recetas.length === 0) return 0
  let minDisp = Infinity
  for (const receta of recetas) {
    const prod = productosMap.get(receta.producto_id)
    if (!prod) return 0
    const stock = parseFloat(prod.stock)
    const cantidad = parseFloat(receta.cantidad)
    if (cantidad <= 0) continue
    const disp = Math.floor(stock / cantidad)
    if (disp < minDisp) minDisp = disp
  }
  return minDisp === Infinity ? 0 : minDisp
}
