import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface Lote {
  id: string
  empresa_id: string
  producto_id: string
  deposito_id: string
  nro_lote: string
  fecha_fabricacion: string | null
  fecha_vencimiento: string | null
  cantidad_inicial: string
  cantidad_actual: string
  costo_unitario: string | null
  factura_compra_id: string | null
  status: string
  created_at: string
  updated_at: string
  created_by: string | null
}

/**
 * Retorna todos los lotes de un producto especifico, con nombre del deposito
 * enriquecido via JOIN. Los lotes son inmutables una vez creados.
 */
export function useLotesPorProducto(productoId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT l.*, d.nombre AS nombre_deposito
     FROM lotes l
     LEFT JOIN depositos d ON d.id = l.deposito_id
     WHERE l.empresa_id = ? AND l.producto_id = ?
     ORDER BY l.fecha_vencimiento ASC, l.created_at ASC`,
    [empresaId, productoId]
  )
  return {
    lotes: (data ?? []) as (Lote & { nombre_deposito: string | null })[],
    isLoading,
  }
}

export async function crearLote(data: {
  producto_id: string
  deposito_id: string
  nro_lote: string
  fecha_fabricacion?: string
  fecha_vencimiento?: string
  cantidad_inicial: number
  costo_unitario?: number
  factura_compra_id?: string
  empresa_id: string
  created_by?: string
}): Promise<string> {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('lotes')
    .values({
      id,
      empresa_id: data.empresa_id,
      producto_id: data.producto_id,
      deposito_id: data.deposito_id,
      nro_lote: data.nro_lote.toUpperCase(),
      fecha_fabricacion: data.fecha_fabricacion ?? null,
      fecha_vencimiento: data.fecha_vencimiento ?? null,
      cantidad_inicial: data.cantidad_inicial.toFixed(3),
      cantidad_actual: data.cantidad_inicial.toFixed(3),
      costo_unitario: data.costo_unitario !== undefined ? data.costo_unitario.toFixed(2) : null,
      factura_compra_id: data.factura_compra_id ?? null,
      status: 'ACTIVO',
      created_at: now,
      updated_at: now,
      created_by: data.created_by ?? null,
    })
    .execute()

  return id
}
