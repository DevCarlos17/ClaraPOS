import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export interface InventarioDepto {
  departamento: string
  valorUsd: number
}

export interface VentaDiaria {
  dia: string
  totalUsd: number
}

export interface TopProductoRango {
  nombre: string
  codigo: string
  cantidad: number
  totalUsd: number
}

// ─── CxC Total Global ─────────────────────────────────────

export function useCxcTotal() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       COALESCE(SUM(CAST(saldo_pend_usd AS REAL)), 0) as total
     FROM ventas
     WHERE empresa_id = ? AND CAST(saldo_pend_usd AS REAL) > 0.01`,
    [empresaId]
  )

  const total = Number((data?.[0] as { total: number })?.total ?? 0)
  return { totalCxcUsd: Number(total.toFixed(2)), isLoading }
}

// ─── Inventario por Departamento ──────────────────────────

export function useInventarioPorDepto() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       d.nombre as departamento,
       COALESCE(SUM(CAST(p.costo_usd AS REAL) * CAST(p.stock AS REAL)), 0) as valor_usd
     FROM productos p
     JOIN departamentos d ON p.departamento_id = d.id
     WHERE p.empresa_id = ? AND p.activo = 1 AND p.tipo = 'P'
     GROUP BY d.id, d.nombre
     HAVING valor_usd > 0
     ORDER BY valor_usd DESC`,
    [empresaId]
  )

  const items: InventarioDepto[] = (data ?? []).map((row: Record<string, unknown>) => ({
    departamento: String(row.departamento ?? ''),
    valorUsd: Number(Number(row.valor_usd ?? 0).toFixed(2)),
  }))

  return { deptos: items, isLoading }
}

// ─── Ventas por Rango de Fechas ───────────────────────────

export function useVentasRango(fechaInicio: string, fechaFin: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const start = `${fechaInicio}T00:00:00.000Z`
  const end = `${fechaFin}T23:59:59.999Z`

  const { data, isLoading } = useQuery(
    `SELECT
       SUBSTR(fecha, 1, 10) as dia,
       COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_usd
     FROM ventas
     WHERE empresa_id = ? AND fecha >= ? AND fecha <= ?
     GROUP BY SUBSTR(fecha, 1, 10)
     ORDER BY dia ASC`,
    [empresaId, start, end]
  )

  const items: VentaDiaria[] = (data ?? []).map((row: Record<string, unknown>) => ({
    dia: String(row.dia ?? ''),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { ventas: items, isLoading }
}

// ─── Top Productos por Rango ──────────────────────────────

export function useTopProductosRango(
  dias: number,
  limit: number,
  order: 'DESC' | 'ASC'
) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - dias)
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}T00:00:00.000Z`
  const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T23:59:59.999Z`

  const { data, isLoading } = useQuery(
    `SELECT
       p.nombre,
       p.codigo,
       COALESCE(SUM(CAST(dv.cantidad AS REAL)), 0) as cantidad,
       COALESCE(SUM(CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL)), 0) as total_usd
     FROM detalle_venta dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE v.empresa_id = ? AND v.fecha >= ? AND v.fecha <= ?
     GROUP BY p.id, p.nombre, p.codigo
     ORDER BY cantidad ${order}
     LIMIT ${limit}`,
    [empresaId, startStr, endStr]
  )

  const items: TopProductoRango[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nombre: String(row.nombre ?? ''),
    codigo: String(row.codigo ?? ''),
    cantidad: Number(row.cantidad ?? 0),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { productos: items, isLoading }
}
