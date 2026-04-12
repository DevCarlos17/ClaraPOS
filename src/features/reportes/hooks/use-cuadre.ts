import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export interface CuadreKpis {
  totalVentasUsd: number
  totalVentasBs: number
  facturasCount: number
  ticketPromedio: number
  gananciaEstimada: number
  cxcTotalUsd: number
  cxcTotalBs: number
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

export interface TopProducto {
  nombre: string
  codigo: string
  cantidad: number
  totalUsd: number
}

export interface VentaAudit {
  id: string
  nro_factura: string
  cliente_nombre: string
  cliente_identificacion: string
  total_usd: string
  total_bs: string
  tasa: string
  tipo: string
  fecha: string
  status: string
}

export interface DetalleCxc {
  id: string
  nro_factura: string
  cliente_nombre: string
  cliente_identificacion: string
  saldo_pend_usd: string
  tasa: string
  fecha: string
}

/**
 * Builds date range for local date filtering.
 * fecha is a YYYY-MM-DD string in local time.
 * Returns ISO strings for start and end of that local day.
 */
function buildDateRange(fecha: string): { start: string; end: string } {
  const start = `${fecha}T00:00:00.000Z`
  const end = `${fecha}T23:59:59.999Z`
  return { start, end }
}

// ─── KPIs ──────────────────────────────────────────────────

export function useVentasDelDia(fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start, end } = buildDateRange(fecha)

  const { data, isLoading } = useQuery(
    `SELECT
       COUNT(*) as cnt,
       COALESCE(SUM(CAST(total_usd AS REAL)), 0) as sum_usd,
       COALESCE(SUM(CAST(total_bs AS REAL)), 0) as sum_bs
     FROM ventas
     WHERE empresa_id = ? AND fecha >= ? AND fecha <= ?`,
    [empresaId, start, end]
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

export function useGananciaEstimada(fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start, end } = buildDateRange(fecha)

  const { data, isLoading } = useQuery(
    `SELECT
       COALESCE(SUM(
         (CAST(dv.precio_unitario_usd AS REAL) - CAST(p.costo_usd AS REAL)) * CAST(dv.cantidad AS REAL)
       ), 0) as ganancia
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE v.empresa_id = ? AND v.fecha >= ? AND v.fecha <= ?`,
    [empresaId, start, end]
  )

  const ganancia = Number((data?.[0] as { ganancia: number })?.ganancia ?? 0)
  return { ganancia: Number(ganancia.toFixed(2)), isLoading }
}

export function useCxcDelDia(fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start, end } = buildDateRange(fecha)

  const { data, isLoading } = useQuery(
    `SELECT
       COALESCE(SUM(CAST(saldo_pend_usd AS REAL)), 0) as cxc_usd,
       COALESCE(SUM(CAST(saldo_pend_usd AS REAL) * CAST(tasa AS REAL)), 0) as cxc_bs
     FROM ventas
     WHERE empresa_id = ? AND fecha >= ? AND fecha <= ?
       AND tipo = 'CREDITO'
       AND CAST(saldo_pend_usd AS REAL) > 0.01`,
    [empresaId, start, end]
  )

  const row = (data?.[0] ?? {}) as { cxc_usd: number; cxc_bs: number }
  return {
    cxcTotalUsd: Number(Number(row.cxc_usd ?? 0).toFixed(2)),
    cxcTotalBs: Number(Number(row.cxc_bs ?? 0).toFixed(2)),
    isLoading,
  }
}

// ─── Breakdown: Departamentos ──────────────────────────────

export function useVentasPorDepto(fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start, end } = buildDateRange(fecha)

  const { data, isLoading } = useQuery(
    `SELECT
       d.nombre as departamento,
       COALESCE(SUM(CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL)), 0) as total_usd
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     JOIN departamentos d ON p.departamento_id = d.id
     WHERE v.empresa_id = ? AND v.fecha >= ? AND v.fecha <= ?
     GROUP BY d.id, d.nombre
     ORDER BY total_usd DESC`,
    [empresaId, start, end]
  )

  const items: VentaDeptItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    departamento: String(row.departamento ?? ''),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { deptos: items, isLoading }
}

// ─── Breakdown: Metodos de Pago ────────────────────────────

export function usePagosPorMetodo(fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start, end } = buildDateRange(fecha)

  const { data, isLoading } = useQuery(
    `SELECT
       mp.nombre,
       mon.codigo_iso as moneda,
       COALESCE(SUM(CAST(pg.monto_usd AS REAL)), 0) as total_usd,
       COALESCE(SUM(CAST(pg.monto AS REAL)), 0) as total_original
     FROM pagos pg
     JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
     LEFT JOIN monedas mon ON mp.moneda_id = mon.id
     WHERE pg.empresa_id = ? AND pg.fecha >= ? AND pg.fecha <= ?
     GROUP BY mp.id, mp.nombre, mon.codigo_iso
     ORDER BY total_usd DESC`,
    [empresaId, start, end]
  )

  const items: MetodoPagoResumen[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nombre: String(row.nombre ?? ''),
    moneda: String(row.moneda ?? 'USD'),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
    totalOriginal: Number(Number(row.total_original ?? 0).toFixed(2)),
  }))

  return { metodos: items, isLoading }
}

// ─── Top Productos ─────────────────────────────────────────

export function useTopProductos(fecha: string, limit = 15) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start, end } = buildDateRange(fecha)

  const { data, isLoading } = useQuery(
    `SELECT
       p.nombre,
       p.codigo,
       COALESCE(SUM(CAST(dv.cantidad AS REAL)), 0) as cantidad,
       COALESCE(SUM(CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL)), 0) as total_usd
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE v.empresa_id = ? AND v.fecha >= ? AND v.fecha <= ?
     GROUP BY p.id, p.nombre, p.codigo
     ORDER BY cantidad DESC
     LIMIT ${limit}`,
    [empresaId, start, end]
  )

  const items: TopProducto[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nombre: String(row.nombre ?? ''),
    codigo: String(row.codigo ?? ''),
    cantidad: Number(row.cantidad ?? 0),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { productos: items, isLoading }
}

// ─── Audit: Lista de Ventas ────────────────────────────────

export function useVentasAudit(fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start, end } = buildDateRange(fecha)

  const { data, isLoading } = useQuery(
    `SELECT
       v.id, v.nro_factura, v.total_usd, v.total_bs, v.tasa, v.tipo, v.fecha, v.status,
       c.nombre as cliente_nombre,
       c.identificacion as cliente_identificacion
     FROM ventas v
     JOIN clientes c ON v.cliente_id = c.id
     WHERE v.empresa_id = ? AND v.fecha >= ? AND v.fecha <= ?
     ORDER BY v.fecha DESC`,
    [empresaId, start, end]
  )

  return { ventas: (data ?? []) as VentaAudit[], isLoading }
}

// ─── Audit: Detalle de una venta ───────────────────────────

export interface DetalleVentaAudit {
  producto_nombre: string
  producto_codigo: string
  cantidad: string
  precio_unitario_usd: string
}

export interface PagoVentaAudit {
  metodo_nombre: string
  moneda: string
  monto: string
  monto_usd: string
  tasa: string
  referencia: string | null
}

export function useDetalleVenta(ventaId: string | null) {
  const { data: detalles, isLoading: loadingDetalles } = useQuery(
    ventaId
      ? `SELECT p.nombre as producto_nombre, p.codigo as producto_codigo, dv.cantidad, dv.precio_unitario_usd
         FROM ventas_det dv
         JOIN productos p ON dv.producto_id = p.id
         WHERE dv.venta_id = ?`
      : '',
    ventaId ? [ventaId] : []
  )

  const { data: pagos, isLoading: loadingPagos } = useQuery(
    ventaId
      ? `SELECT mp.nombre as metodo_nombre, mon.codigo_iso as moneda, pg.monto, pg.monto_usd, pg.tasa, pg.referencia
         FROM pagos pg
         JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
         LEFT JOIN monedas mon ON pg.moneda_id = mon.id
         WHERE pg.venta_id = ?`
      : '',
    ventaId ? [ventaId] : []
  )

  return {
    detalles: (detalles ?? []) as DetalleVentaAudit[],
    pagos: (pagos ?? []) as PagoVentaAudit[],
    isLoading: loadingDetalles || loadingPagos,
  }
}

// ─── CxC del dia ───────────────────────────────────────────

export function useDetalleCxcDia(fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { start, end } = buildDateRange(fecha)

  const { data, isLoading } = useQuery(
    `SELECT
       v.id, v.nro_factura, v.saldo_pend_usd, v.tasa, v.fecha,
       c.nombre as cliente_nombre,
       c.identificacion as cliente_identificacion
     FROM ventas v
     JOIN clientes c ON v.cliente_id = c.id
     WHERE v.empresa_id = ? AND v.fecha >= ? AND v.fecha <= ?
       AND v.tipo = 'CREDITO'
       AND CAST(v.saldo_pend_usd AS REAL) > 0.01
     ORDER BY v.fecha ASC`,
    [empresaId, start, end]
  )

  return { facturas: (data ?? []) as DetalleCxc[], isLoading }
}
