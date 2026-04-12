import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface InventarioKpis {
  valorTotalUsd: number
  productosActivos: number
  stockCritico: number
  movimientosPeriodo: number
}

export interface ValorDeptoItem {
  departamento: string
  valorUsd: number
}

export interface ProductoStockCritico {
  codigo: string
  nombre: string
  departamento: string
  stock: number
  stockMinimo: number
  deficit: number
}

export interface MovimientoPeriodo {
  id: string
  fecha: string
  producto_codigo: string
  producto_nombre: string
  tipo: string
  origen: string
  cantidad: string
  stock_anterior: string
  stock_nuevo: string
  motivo: string | null
}

// ─── Helpers ────────────────────────────────────────────────

function buildDateRange(fecha: string): { start: string; end: string } {
  const start = `${fecha}T00:00:00.000Z`
  const end = `${fecha}T23:59:59.999Z`
  return { start, end }
}

// ─── KPIs ───────────────────────────────────────────────────

export function useInventarioKpis(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start } = buildDateRange(fechaDesde)
  const { end } = buildDateRange(fechaHasta)

  // Valor total + productos activos + stock critico
  const { data: resumenData, isLoading: loadingResumen } = useQuery(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'P' THEN CAST(costo_usd AS REAL) * CAST(stock AS REAL) ELSE 0 END), 0) as valor_total,
       COUNT(*) as activos,
       SUM(CASE WHEN tipo = 'P' AND CAST(stock AS REAL) < CAST(stock_minimo AS REAL) AND CAST(stock_minimo AS REAL) > 0 THEN 1 ELSE 0 END) as criticos
     FROM productos
     WHERE empresa_id = ? AND is_active = 1`,
    [empresaId]
  )

  // Movimientos en el periodo
  const { data: movData, isLoading: loadingMov } = useQuery(
    `SELECT COUNT(*) as cnt
     FROM movimientos_inventario
     WHERE empresa_id = ? AND fecha >= ? AND fecha <= ?`,
    [empresaId, start, end]
  )

  const resumen = (resumenData?.[0] ?? {}) as { valor_total: number; activos: number; criticos: number }
  const movCount = Number((movData?.[0] as { cnt: number })?.cnt ?? 0)

  return {
    valorTotalUsd: Number(Number(resumen.valor_total ?? 0).toFixed(2)),
    productosActivos: Number(resumen.activos ?? 0),
    stockCritico: Number(resumen.criticos ?? 0),
    movimientosPeriodo: movCount,
    isLoading: loadingResumen || loadingMov,
  }
}

// ─── Valoracion por Departamento ────────────────────────────

export function useValorPorDepto() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       d.nombre as departamento,
       COALESCE(SUM(CAST(p.costo_usd AS REAL) * CAST(p.stock AS REAL)), 0) as valor_usd
     FROM productos p
     JOIN departamentos d ON p.departamento_id = d.id
     WHERE p.empresa_id = ? AND p.is_active = 1 AND p.tipo = 'P'
     GROUP BY d.id, d.nombre
     HAVING valor_usd > 0
     ORDER BY valor_usd DESC`,
    [empresaId]
  )

  const items: ValorDeptoItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    departamento: String(row.departamento ?? ''),
    valorUsd: Number(Number(row.valor_usd ?? 0).toFixed(2)),
  }))

  return { deptos: items, isLoading }
}

// ─── Productos con Stock Critico ────────────────────────────

export function useProductosStockCritico() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       p.codigo,
       p.nombre,
       d.nombre as departamento,
       CAST(p.stock AS REAL) as stock,
       CAST(p.stock_minimo AS REAL) as stock_minimo
     FROM productos p
     JOIN departamentos d ON p.departamento_id = d.id
     WHERE p.empresa_id = ? AND p.is_active = 1 AND p.tipo = 'P'
       AND CAST(p.stock AS REAL) < CAST(p.stock_minimo AS REAL)
       AND CAST(p.stock_minimo AS REAL) > 0
     ORDER BY (CAST(p.stock_minimo AS REAL) - CAST(p.stock AS REAL)) DESC`,
    [empresaId]
  )

  const items: ProductoStockCritico[] = (data ?? []).map((row: Record<string, unknown>) => {
    const stock = Number(row.stock ?? 0)
    const stockMinimo = Number(row.stock_minimo ?? 0)
    return {
      codigo: String(row.codigo ?? ''),
      nombre: String(row.nombre ?? ''),
      departamento: String(row.departamento ?? ''),
      stock,
      stockMinimo,
      deficit: Number((stockMinimo - stock).toFixed(3)),
    }
  })

  return { productos: items, isLoading }
}

// ─── Movimientos del Periodo ────────────────────────────────

export function useMovimientosPeriodo(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start } = buildDateRange(fechaDesde)
  const { end } = buildDateRange(fechaHasta)

  const { data, isLoading } = useQuery(
    `SELECT
       m.id, m.fecha, m.tipo, m.origen, m.cantidad, m.stock_anterior, m.stock_nuevo, m.motivo,
       p.codigo as producto_codigo,
       p.nombre as producto_nombre
     FROM movimientos_inventario m
     JOIN productos p ON m.producto_id = p.id
     WHERE m.empresa_id = ? AND m.fecha >= ? AND m.fecha <= ?
     ORDER BY m.fecha DESC
     LIMIT 100`,
    [empresaId, start, end]
  )

  return { movimientos: (data ?? []) as MovimientoPeriodo[], isLoading }
}
