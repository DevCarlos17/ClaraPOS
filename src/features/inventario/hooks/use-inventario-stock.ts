import { useMemo } from 'react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  pivotExistencias,
  buildExistenciasPorDepositoSql,
  type ExistenciaRawRow,
  type ExistenciaRow,
} from '@/features/inventario/lib/existencias-pivot'

export type { ExistenciaRawRow, ExistenciaRow }

export interface StockItem {
  id: string
  empresa_id: string
  producto_id: string
  deposito_id: string
  cantidad_actual: string
  stock_reservado: string
  updated_at: string
  updated_by: string | null
}

/**
 * Retorna todas las entradas de stock de un producto especifico a traves de
 * todos sus depositos. READ-ONLY — el stock solo se modifica via movimientos.
 */
export function useStockPorProducto(productoId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT s.*, d.nombre AS nombre_deposito
     FROM inventario_stock s
     LEFT JOIN depositos d ON d.id = s.deposito_id
     WHERE s.empresa_id = ? AND s.producto_id = ?
     ORDER BY d.nombre ASC`,
    [empresaId, productoId]
  )
  return {
    stock: (data ?? []) as (StockItem & { nombre_deposito: string | null })[],
    isLoading,
  }
}

/**
 * Retorna todas las entradas de stock de un deposito especifico a traves de
 * todos sus productos. READ-ONLY — el stock solo se modifica via movimientos.
 */
export function useStockPorDeposito(depositoId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT s.*, p.nombre AS nombre_producto, p.codigo AS codigo_producto
     FROM inventario_stock s
     LEFT JOIN productos p ON p.id = s.producto_id
     WHERE s.empresa_id = ? AND s.deposito_id = ?
     ORDER BY p.nombre ASC`,
    [empresaId, depositoId]
  )
  return {
    stock: (data ?? []) as (StockItem & {
      nombre_producto: string | null
      codigo_producto: string | null
    })[],
    isLoading,
  }
}

/**
 * Matriz de existencias producto x deposito para la empresa actual: una sola
 * query plana (JOIN `productos` LEFT JOIN `inventario_stock`, filtrada por
 * `empresa_id` y `tipo='P'`) pivotada por la funcion pura `pivotExistencias`.
 * READ-ONLY — usada por la vista "Existencias por deposito" (Traspasos).
 */
export function useExistenciasPorDeposito() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(buildExistenciasPorDepositoSql(), [empresaId])

  const rows = useMemo(() => pivotExistencias((data ?? []) as ExistenciaRawRow[]), [data])

  return { rows, isLoading }
}
