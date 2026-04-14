import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Filters ────────────────────────────────────────────────

export interface CuadreFilters {
  fecha: string
  cajaId: string | null
  sesionCajaId: string | null
}

/**
 * Builds dynamic WHERE clause fragments for cuadre queries.
 * Returns [whereClause, params].
 * `tableAlias` is the alias prefix (e.g. 'v' for ventas).
 * `dateColumn` is the column name for date filtering (default: 'fecha').
 */
function buildCuadreWhere(
  filters: CuadreFilters,
  empresaId: string,
  tableAlias = '',
  dateColumn = 'fecha'
): [string, unknown[]] {
  const prefix = tableAlias ? `${tableAlias}.` : ''
  const clauses: string[] = [`${prefix}empresa_id = ?`, `SUBSTR(${prefix}${dateColumn}, 1, 10) = ?`]
  const params: unknown[] = [empresaId, filters.fecha]

  if (filters.sesionCajaId) {
    clauses.push(`${prefix}sesion_caja_id = ?`)
    params.push(filters.sesionCajaId)
  } else if (filters.cajaId) {
    clauses.push(
      `${prefix}sesion_caja_id IN (SELECT id FROM sesiones_caja WHERE caja_id = ? AND empresa_id = ?)`
    )
    params.push(filters.cajaId, empresaId)
  }

  return [clauses.join(' AND '), params]
}

/**
 * Same as buildCuadreWhere but for tables without sesion_caja_id (like ventas_det).
 * Filters via a JOIN to the ventas table using ventaAlias.
 */
function buildCuadreWhereViaVenta(
  filters: CuadreFilters,
  empresaId: string,
  ventaAlias: string,
  dateColumn = 'fecha'
): [string, unknown[]] {
  const clauses: string[] = [
    `${ventaAlias}.empresa_id = ?`,
    `SUBSTR(${ventaAlias}.${dateColumn}, 1, 10) = ?`,
  ]
  const params: unknown[] = [empresaId, filters.fecha]

  if (filters.sesionCajaId) {
    clauses.push(`${ventaAlias}.sesion_caja_id = ?`)
    params.push(filters.sesionCajaId)
  } else if (filters.cajaId) {
    clauses.push(
      `${ventaAlias}.sesion_caja_id IN (SELECT id FROM sesiones_caja WHERE caja_id = ? AND empresa_id = ?)`
    )
    params.push(filters.cajaId, empresaId)
  }

  return [clauses.join(' AND '), params]
}

// ─── Interfaces ─────────────────────────────────────────────

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

export interface TopGananciaItem {
  nombre: string
  codigo: string
  cantidad: number
  gananciaUsd: number
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

export interface FacturaMetodoItem {
  venta_id: string
  nro_factura: string
  cliente_nombre: string
  monto: string
  monto_usd: string
  referencia: string | null
  fecha: string
}

export interface ProductoDeptoItem {
  codigo: string
  nombre: string
  cantidad: number
  totalUsd: number
}

// ─── KPIs ──────────────────────────────────────────────────

export function useVentasDelDia(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhere(filters, empresaId)
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       COUNT(*) as cnt,
       COALESCE(SUM(CAST(total_usd AS REAL)), 0) as sum_usd,
       COALESCE(SUM(CAST(total_bs AS REAL)), 0) as sum_bs
     FROM ventas
     WHERE ${where}`,
    params
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

export function useGananciaEstimada(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhereViaVenta(filters, empresaId, 'v')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       COALESCE(SUM(
         (CAST(dv.precio_unitario_usd AS REAL) - CAST(p.costo_usd AS REAL)) * CAST(dv.cantidad AS REAL)
       ), 0) as ganancia
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE ${where}`,
    params
  )

  const ganancia = Number((data?.[0] as { ganancia: number })?.ganancia ?? 0)
  return { ganancia: Number(ganancia.toFixed(2)), isLoading }
}

export function useCxcDelDia(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhere(filters, empresaId)
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       COALESCE(SUM(CAST(saldo_pend_usd AS REAL)), 0) as cxc_usd,
       COALESCE(SUM(CAST(saldo_pend_usd AS REAL) * CAST(tasa AS REAL)), 0) as cxc_bs
     FROM ventas
     WHERE ${where}
       AND tipo = 'CREDITO'
       AND CAST(saldo_pend_usd AS REAL) > 0.01`,
    params
  )

  const row = (data?.[0] ?? {}) as { cxc_usd: number; cxc_bs: number }
  return {
    cxcTotalUsd: Number(Number(row.cxc_usd ?? 0).toFixed(2)),
    cxcTotalBs: Number(Number(row.cxc_bs ?? 0).toFixed(2)),
    isLoading,
  }
}

// ─── Breakdown: Departamentos ──────────────────────────────

export function useVentasPorDepto(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhereViaVenta(filters, empresaId, 'v')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       d.nombre as departamento,
       COALESCE(SUM(CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL)), 0) as total_usd
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     JOIN departamentos d ON p.departamento_id = d.id
     WHERE ${where}
     GROUP BY d.id, d.nombre
     ORDER BY total_usd DESC`,
    params
  )

  const items: VentaDeptItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    departamento: String(row.departamento ?? ''),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { deptos: items, isLoading }
}

// ─── Breakdown: Metodos de Pago ────────────────────────────

export function usePagosPorMetodo(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhere(filters, empresaId, 'pg')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       mp.nombre,
       CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mon.codigo_iso, 'USD') END as moneda,
       COALESCE(SUM(CAST(pg.monto_usd AS REAL)), 0) as total_usd,
       COALESCE(SUM(CAST(pg.monto AS REAL)), 0) as total_original
     FROM pagos pg
     JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
     LEFT JOIN monedas mon ON mp.moneda_id = mon.id
     WHERE ${where}
     GROUP BY mp.id, mp.nombre, moneda
     ORDER BY total_usd DESC`,
    params
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

export function useTopProductos(filters: CuadreFilters | null, limit = 15) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhereViaVenta(filters, empresaId, 'v')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       p.nombre,
       p.codigo,
       COALESCE(SUM(CAST(dv.cantidad AS REAL)), 0) as cantidad,
       COALESCE(SUM(CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL)), 0) as total_usd
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE ${where}
     GROUP BY p.id, p.nombre, p.codigo
     ORDER BY cantidad DESC
     LIMIT ${limit}`,
    params
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

export function useVentasAudit(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhere(filters, empresaId, 'v')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       v.id, v.nro_factura, v.total_usd, v.total_bs, v.tasa, v.tipo, v.fecha, v.status,
       c.nombre as cliente_nombre,
       c.identificacion as cliente_identificacion
     FROM ventas v
     JOIN clientes c ON v.cliente_id = c.id
     WHERE ${where}
     ORDER BY v.fecha DESC`,
    params
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
      ? `SELECT mp.nombre as metodo_nombre, CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mon.codigo_iso, 'USD') END as moneda, pg.monto, pg.monto_usd, pg.tasa, pg.referencia
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

export function useDetalleCxcDia(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhere(filters, empresaId, 'v')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       v.id, v.nro_factura, v.saldo_pend_usd, v.tasa, v.fecha,
       c.nombre as cliente_nombre,
       c.identificacion as cliente_identificacion
     FROM ventas v
     JOIN clientes c ON v.cliente_id = c.id
     WHERE ${where}
       AND v.tipo = 'CREDITO'
       AND CAST(v.saldo_pend_usd AS REAL) > 0.01
     ORDER BY v.fecha ASC`,
    params
  )

  return { facturas: (data ?? []) as DetalleCxc[], isLoading }
}

// ─── Sesiones por Caja y Fecha ─────────────────────────────

export interface SesionCajaOption {
  id: string
  status: string
  fecha_apertura: string
}

export function useSesionesPorCajaYFecha(cajaId: string | null, fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    cajaId
      ? `SELECT id, status, fecha_apertura
         FROM sesiones_caja
         WHERE empresa_id = ? AND caja_id = ? AND SUBSTR(fecha_apertura, 1, 10) = ?
         ORDER BY fecha_apertura DESC`
      : '',
    cajaId ? [empresaId, cajaId, fecha] : []
  )

  return { sesiones: (data ?? []) as SesionCajaOption[], isLoading }
}

// ─── Tasa del Dia ──────────────────────────────────────────

export function useTasaDelDia(fecha: string | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    fecha
      ? `SELECT
           COALESCE(AVG(CAST(tasa AS REAL)), 0) as avg_tasa,
           COUNT(*) as cnt
         FROM tasas_cambio
         WHERE empresa_id = ? AND SUBSTR(created_at, 1, 10) = ?`
      : '',
    fecha ? [empresaId, fecha] : []
  )

  const row = (data?.[0] ?? {}) as { avg_tasa: number; cnt: number }
  return {
    tasaPromedio: Number(Number(row.avg_tasa ?? 0).toFixed(4)),
    tasaCount: Number(row.cnt ?? 0),
    isLoading,
  }
}

// ─── Top Ganancias ─────────────────────────────────────────

export function useTopGanancias(filters: CuadreFilters | null, limit = 10) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhereViaVenta(filters, empresaId, 'v')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       p.nombre,
       p.codigo,
       COALESCE(SUM(CAST(dv.cantidad AS REAL)), 0) as cantidad,
       COALESCE(SUM(
         (CAST(dv.precio_unitario_usd AS REAL) - CAST(p.costo_usd AS REAL)) * CAST(dv.cantidad AS REAL)
       ), 0) as ganancia_usd
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE ${where}
     GROUP BY p.id, p.nombre, p.codigo
     HAVING ganancia_usd > 0
     ORDER BY ganancia_usd DESC
     LIMIT ${limit}`,
    params
  )

  const items: TopGananciaItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nombre: String(row.nombre ?? ''),
    codigo: String(row.codigo ?? ''),
    cantidad: Number(row.cantidad ?? 0),
    gananciaUsd: Number(Number(row.ganancia_usd ?? 0).toFixed(2)),
  }))

  return { productos: items, isLoading }
}

// ─── Facturas por Metodo de Pago ───────────────────────────

export function useFacturasPorMetodo(filters: CuadreFilters | null, metodoNombre: string | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters && metodoNombre
    ? buildCuadreWhere(filters, empresaId, 'pg')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    filters && metodoNombre
      ? `SELECT
           pg.venta_id,
           v.nro_factura,
           c.nombre as cliente_nombre,
           pg.monto,
           pg.monto_usd,
           pg.referencia,
           pg.fecha
         FROM pagos pg
         JOIN ventas v ON pg.venta_id = v.id
         JOIN clientes c ON v.cliente_id = c.id
         JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
         WHERE ${where} AND mp.nombre = ?
         ORDER BY pg.fecha DESC`
      : '',
    filters && metodoNombre ? [...params, metodoNombre] : []
  )

  return { facturas: (data ?? []) as FacturaMetodoItem[], isLoading }
}

// ─── Productos por Departamento ────────────────────────────

export function useProductosPorDepto(filters: CuadreFilters | null, deptoNombre: string | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters && deptoNombre
    ? buildCuadreWhereViaVenta(filters, empresaId, 'v')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    filters && deptoNombre
      ? `SELECT
           p.codigo,
           p.nombre,
           COALESCE(SUM(CAST(dv.cantidad AS REAL)), 0) as cantidad,
           COALESCE(SUM(CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL)), 0) as total_usd
         FROM ventas_det dv
         JOIN ventas v ON dv.venta_id = v.id
         JOIN productos p ON dv.producto_id = p.id
         JOIN departamentos d ON p.departamento_id = d.id
         WHERE ${where} AND d.nombre = ?
         GROUP BY p.id, p.nombre, p.codigo
         ORDER BY cantidad DESC`
      : '',
    filters && deptoNombre ? [...params, deptoNombre] : []
  )

  const items: ProductoDeptoItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    codigo: String(row.codigo ?? ''),
    nombre: String(row.nombre ?? ''),
    cantidad: Number(row.cantidad ?? 0),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { productos: items, isLoading }
}
