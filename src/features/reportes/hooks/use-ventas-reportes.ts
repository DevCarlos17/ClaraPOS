import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface VentaDiaria {
  dia: string
  totalUsd: number
}

export interface VentaDeptItem {
  departamento: string
  totalUsd: number
}

export interface MetodoPagoResumen {
  nombre: string
  moneda: string
  totalUsd: number
  totalOriginal: number
}

export interface TopProductoVentas {
  codigo: string
  nombre: string
  cantidad: number
  totalUsd: number
}

export interface TopClienteVentas {
  nombre: string
  identificacion: string
  facturas: number
  totalUsd: number
}

// ─── KPIs ───────────────────────────────────────────────────

export function useVentasKpisRango(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       COUNT(*) as cnt,
       COALESCE(SUM(CAST(total_usd AS REAL)), 0) as sum_usd,
       COALESCE(SUM(CAST(total_bs AS REAL)), 0) as sum_bs
     FROM ventas
     WHERE empresa_id = ? AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const row = (data?.[0] ?? {}) as { cnt: number; sum_usd: number; sum_bs: number }
  const count = Number(row.cnt ?? 0)
  const totalUsd = Number(row.sum_usd ?? 0)
  const totalBs = Number(row.sum_bs ?? 0)

  return {
    facturasCount: count,
    totalVentasUsd: totalUsd,
    totalVentasBs: totalBs,
    ticketPromedio: count > 0 ? Number((totalUsd / count).toFixed(2)) : 0,
    isLoading,
  }
}

export function useGananciaRango(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       COALESCE(SUM(
         (CAST(dv.precio_unitario_usd AS REAL) - CAST(p.costo_usd AS REAL)) * CAST(dv.cantidad AS REAL)
       ), 0) as ganancia
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE v.empresa_id = ? AND SUBSTR(v.fecha, 1, 10) >= ? AND SUBSTR(v.fecha, 1, 10) <= ?`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const ganancia = Number((data?.[0] as { ganancia: number })?.ganancia ?? 0)
  return { ganancia: Number(ganancia.toFixed(2)), isLoading }
}

// ─── Tendencia Diaria ───────────────────────────────────────

export function useVentasDiarias(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       SUBSTR(fecha, 1, 10) as dia,
       COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_usd
     FROM ventas
     WHERE empresa_id = ? AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?
     GROUP BY SUBSTR(fecha, 1, 10)
     ORDER BY dia ASC`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const items: VentaDiaria[] = (data ?? []).map((row: Record<string, unknown>) => ({
    dia: String(row.dia ?? ''),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { ventas: items, isLoading }
}

// ─── Ventas por Departamento ────────────────────────────────

export function useVentasPorDeptoRango(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       d.nombre as departamento,
       COALESCE(SUM(CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL)), 0) as total_usd
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     JOIN departamentos d ON p.departamento_id = d.id
     WHERE v.empresa_id = ? AND SUBSTR(v.fecha, 1, 10) >= ? AND SUBSTR(v.fecha, 1, 10) <= ?
     GROUP BY d.id, d.nombre
     ORDER BY total_usd DESC`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const items: VentaDeptItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    departamento: String(row.departamento ?? ''),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { deptos: items, isLoading }
}

// ─── Pagos por Metodo ───────────────────────────────────────

export function usePagosPorMetodoRango(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       mp.nombre,
       CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mon.codigo_iso, 'USD') END as moneda,
       COALESCE(SUM(CAST(pg.monto_usd AS REAL)), 0) as total_usd,
       COALESCE(SUM(CAST(pg.monto AS REAL)), 0) as total_original
     FROM pagos pg
     JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
     LEFT JOIN monedas mon ON mp.moneda_id = mon.id
     WHERE pg.empresa_id = ? AND SUBSTR(pg.fecha, 1, 10) >= ? AND SUBSTR(pg.fecha, 1, 10) <= ?
     GROUP BY mp.id, mp.nombre, moneda
     ORDER BY total_usd DESC`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const items: MetodoPagoResumen[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nombre: String(row.nombre ?? ''),
    moneda: String(row.moneda ?? 'USD'),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
    totalOriginal: Number(Number(row.total_original ?? 0).toFixed(2)),
  }))

  return { metodos: items, isLoading }
}

// ─── Top Productos ──────────────────────────────────────────

export function useTopProductosVentas(fechaDesde: string, fechaHasta: string, limit = 10) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       p.codigo,
       p.nombre,
       COALESCE(SUM(CAST(dv.cantidad AS REAL)), 0) as cantidad,
       COALESCE(SUM(CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL)), 0) as total_usd
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE v.empresa_id = ? AND SUBSTR(v.fecha, 1, 10) >= ? AND SUBSTR(v.fecha, 1, 10) <= ?
     GROUP BY p.id, p.codigo, p.nombre
     ORDER BY cantidad DESC
     LIMIT ${limit}`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const items: TopProductoVentas[] = (data ?? []).map((row: Record<string, unknown>) => ({
    codigo: String(row.codigo ?? ''),
    nombre: String(row.nombre ?? ''),
    cantidad: Number(row.cantidad ?? 0),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { productos: items, isLoading }
}

// ─── Top Clientes ───────────────────────────────────────────

export function useTopClientesVentas(fechaDesde: string, fechaHasta: string, limit = 10) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       c.nombre as nombre,
       c.identificacion,
       COUNT(*) as facturas,
       COALESCE(SUM(CAST(v.total_usd AS REAL)), 0) as total_usd
     FROM ventas v
     JOIN clientes c ON v.cliente_id = c.id
     WHERE v.empresa_id = ? AND SUBSTR(v.fecha, 1, 10) >= ? AND SUBSTR(v.fecha, 1, 10) <= ?
     GROUP BY c.id, c.nombre, c.identificacion
     ORDER BY total_usd DESC
     LIMIT ${limit}`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const items: TopClienteVentas[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nombre: String(row.nombre ?? ''),
    identificacion: String(row.identificacion ?? ''),
    facturas: Number(row.facturas ?? 0),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { clientes: items, isLoading }
}
