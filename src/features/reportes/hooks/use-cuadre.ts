import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Shared types ───────────────────────────────────────────

/**
 * Verified payment entry emitted by CuadreDetallePagos per metodo_cobro_id.
 * native  = amount in the method's own currency (Bs for BS methods, USD for USD methods)
 * usd     = USD equivalent
 * moneda  = 'USD' | 'BS'
 * overrideCount = number of payments whose amount was adjusted by a supervisor
 */
export interface VerifiedEntry {
  native: number
  usd: number
  moneda: string
  overrideCount: number
}

// ─── Filters ────────────────────────────────────────────────

export interface CuadreFilters {
  fecha: string
  cajaId: string | null
  sesionCajaIds: string[]   // empty = todas las sesiones del dia/caja
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
  const clauses: string[] = [`${prefix}empresa_id = ?`]
  const params: unknown[] = [empresaId]

  if (filters.sesionCajaIds.length > 0) {
    // IDs de sesion ya acotan el rango — no se aplica filtro de fecha
    const placeholders = filters.sesionCajaIds.map(() => '?').join(', ')
    clauses.push(`${prefix}sesion_caja_id IN (${placeholders})`)
    params.push(...filters.sesionCajaIds)
  } else if (filters.cajaId) {
    clauses.push(`DATE(${prefix}${dateColumn}, 'localtime') = ?`)
    clauses.push(
      `${prefix}sesion_caja_id IN (SELECT id FROM sesiones_caja WHERE caja_id = ? AND empresa_id = ?)`
    )
    params.push(filters.fecha, filters.cajaId, empresaId)
  } else {
    clauses.push(`DATE(${prefix}${dateColumn}, 'localtime') = ?`)
    params.push(filters.fecha)
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
  const clauses: string[] = [`${ventaAlias}.empresa_id = ?`]
  const params: unknown[] = [empresaId]

  if (filters.sesionCajaIds.length > 0) {
    // IDs de sesion ya acotan el rango — no se aplica filtro de fecha
    const placeholders = filters.sesionCajaIds.map(() => '?').join(', ')
    clauses.push(`${ventaAlias}.sesion_caja_id IN (${placeholders})`)
    params.push(...filters.sesionCajaIds)
  } else if (filters.cajaId) {
    clauses.push(`DATE(${ventaAlias}.${dateColumn}, 'localtime') = ?`)
    clauses.push(
      `${ventaAlias}.sesion_caja_id IN (SELECT id FROM sesiones_caja WHERE caja_id = ? AND empresa_id = ?)`
    )
    params.push(filters.fecha, filters.cajaId, empresaId)
  } else {
    clauses.push(`DATE(${ventaAlias}.${dateColumn}, 'localtime') = ?`)
    params.push(filters.fecha)
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
  tipo: string
  totalUsd: number
  totalOriginal: number
  totalBs: number
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
  saldo_pend_usd: string
  metodos_pago: string | null
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
  moneda: string
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

  console.log('[useVentasDelDia]', { empresaId, filters, where, params, data, isLoading })

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

  console.log('[useCxcDelDia]', { empresaId, filters, where, params, data, isLoading })

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

// ─── Helper: WHERE para movimientos_metodo_cobro ───────────

/**
 * Construye WHERE para movimientos_metodo_cobro usando los mismos filtros de cuadre.
 * Se usa para detectar metodos EFECTIVO con saldo manual (sin pagos de venta).
 */
function buildMovsWhere(
  filters: CuadreFilters,
  empresaId: string,
  alias = 'mmc'
): [string, unknown[]] {
  const p = alias ? `${alias}.` : ''
  const clauses: string[] = [`${p}empresa_id = ?`]
  const params: unknown[] = [empresaId]

  if (filters.sesionCajaIds.length > 0) {
    const ph = filters.sesionCajaIds.map(() => '?').join(', ')
    clauses.push(`${p}sesion_caja_id IN (${ph})`)
    params.push(...filters.sesionCajaIds)
  } else if (filters.cajaId) {
    clauses.push(
      `${p}sesion_caja_id IN (SELECT id FROM sesiones_caja WHERE caja_id = ? AND empresa_id = ?)`
    )
    params.push(filters.cajaId, empresaId)
  } else {
    clauses.push(`DATE(${p}fecha, 'localtime') = ?`)
    params.push(filters.fecha)
  }

  return [clauses.join(' AND '), params]
}

// ─── Breakdown: Metodos de Pago ────────────────────────────

export function usePagosPorMetodo(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhere(filters, empresaId, 'pg')
    : ['1=0', []]

  // Para la subquery NOT IN necesitamos el mismo WHERE con alias distinto
  const [whereNotIn, paramsNotIn] = filters
    ? buildCuadreWhere(filters, empresaId, 'pg2')
    : ['1=0', []]

  // WHERE para movimientos_metodo_cobro (detectar metodos con saldo manual)
  const [whereMmc, paramsMmc] = filters
    ? buildMovsWhere(filters, empresaId, 'mmc')
    : ['1=0', []]

  // Query principal: metodos con pagos de ventas
  const { data, isLoading } = useQuery(
    `SELECT
       mp.id as metodo_cobro_id,
       mp.nombre,
       mp.tipo,
       CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mon.codigo_iso, 'USD') END as moneda,
       COALESCE(SUM(CAST(pg.monto_usd AS REAL)), 0) as total_usd,
       COALESCE(SUM(CAST(pg.monto AS REAL)), 0) as total_original,
       COALESCE(SUM(CAST(pg.monto_usd AS REAL) * CAST(v.tasa AS REAL)), 0) as total_bs
     FROM pagos pg
     JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
     LEFT JOIN monedas mon ON mp.moneda_id = mon.id
     LEFT JOIN ventas v ON pg.venta_id = v.id
     WHERE ${where}
     GROUP BY mp.id, mp.nombre, mp.tipo, moneda
     ORDER BY total_usd DESC`,
    params
  )

  // Query secundaria: metodos EFECTIVO con movimientos manuales pero sin pagos de venta.
  // Cubre el caso de caja con fondo inicial o ingresos manuales y sin ventas.
  const { data: extraData, isLoading: extraLoading } = useQuery(
    filters
      ? `SELECT
           mc.id as metodo_cobro_id,
           mc.nombre,
           mc.tipo,
           CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mon.codigo_iso, 'USD') END as moneda,
           0 as total_usd,
           0 as total_original,
           0 as total_bs
         FROM metodos_cobro mc
         LEFT JOIN monedas mon ON mc.moneda_id = mon.id
         WHERE mc.tipo = 'EFECTIVO'
           AND mc.empresa_id = ?
           AND mc.id NOT IN (
             SELECT DISTINCT pg2.metodo_cobro_id FROM pagos pg2 WHERE ${whereNotIn}
           )
           AND mc.id IN (
             SELECT DISTINCT mmc.metodo_cobro_id
             FROM movimientos_metodo_cobro mmc
             WHERE ${whereMmc}
           )`
      : '',
    filters ? [empresaId, ...paramsNotIn, ...paramsMmc] : []
  )

  const toItem = (row: Record<string, unknown>) => ({
    metodo_cobro_id: String(row.metodo_cobro_id ?? ''),
    nombre: String(row.nombre ?? ''),
    tipo: String(row.tipo ?? ''),
    moneda: String(row.moneda ?? 'USD'),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
    totalOriginal: Number(Number(row.total_original ?? 0).toFixed(2)),
    totalBs: Number(Number(row.total_bs ?? 0).toFixed(2)),
  })

  const pagoItems = (data ?? []).map(toItem)
  const extraItems = (extraData ?? []).map(toItem)

  // Deduplicar: si un metodo ya aparece en pagos, no lo agregamos del extra
  const idsEnPagos = new Set(pagoItems.map((m) => m.metodo_cobro_id))
  const items: (MetodoPagoResumen & { metodo_cobro_id: string })[] = [
    ...pagoItems,
    ...extraItems.filter((m) => !idsEnPagos.has(m.metodo_cobro_id)),
  ]

  return { metodos: items, isLoading: isLoading || extraLoading }
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
       v.saldo_pend_usd,
       c.nombre as cliente_nombre,
       c.identificacion as cliente_identificacion,
       (SELECT GROUP_CONCAT(nombre, ', ')
        FROM (SELECT DISTINCT mp.nombre as nombre
              FROM pagos pg
              JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
              WHERE pg.venta_id = v.id AND pg.is_reversed = 0
              ORDER BY mp.nombre)) as metodos_pago
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
  usuario_nombre: string | null
}

export function useSesionesPorCajaYFecha(cajaId: string | null, fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    cajaId
      ? `SELECT sc.id, sc.status, sc.fecha_apertura, u.nombre as usuario_nombre
         FROM sesiones_caja sc
         LEFT JOIN usuarios u ON sc.usuario_apertura_id = u.id
         WHERE sc.empresa_id = ? AND sc.caja_id = ? AND DATE(sc.fecha_apertura, 'localtime') = ?
         ORDER BY sc.fecha_apertura ASC`
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
         WHERE empresa_id = ? AND DATE(created_at, 'localtime') = ?`
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

// ─── Productos por Factura (para informe impreso) ───────────

export interface ProductoFacturaItem {
  venta_id: string
  nro_factura: string
  cliente_nombre: string
  producto_nombre: string
  producto_codigo: string
  cantidad: number
  precio_unitario_usd: number
  costo_usd: number
  impuesto_pct: number
  subtotal_usd: number
  tipo_impuesto: string
}

export function useProductosPorFactura(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhereViaVenta(filters, empresaId, 'v')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       v.id as venta_id,
       v.nro_factura,
       c.nombre as cliente_nombre,
       p.nombre as producto_nombre,
       p.codigo as producto_codigo,
       CAST(p.costo_usd AS REAL) as costo_usd,
       CAST(dv.cantidad AS REAL) as cantidad,
       CAST(dv.precio_unitario_usd AS REAL) as precio_unitario_usd,
       CAST(dv.impuesto_pct AS REAL) as impuesto_pct,
       CAST(dv.subtotal_usd AS REAL) as subtotal_usd,
       COALESCE(dv.tipo_impuesto, '') as tipo_impuesto
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     JOIN clientes c ON v.cliente_id = c.id
     WHERE ${where}
     ORDER BY v.nro_factura, p.nombre`,
    params
  )

  return { items: (data ?? []) as ProductoFacturaItem[], isLoading }
}

// ─── Movimientos Manuales por Sesion ───────────────────────

export interface MovimientoManualItem {
  metodo_cobro_id: string
  metodo_nombre: string
  metodo_tipo: string
  metodo_moneda: string
  mov_tipo: string
  origen: string
  total: number
}

export function useMovimientosManualesDia(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hasSession = !!filters && filters.sesionCajaIds.length > 0
  const placeholders = hasSession ? filters!.sesionCajaIds.map(() => '?').join(', ') : ''

  const { data, isLoading } = useQuery(
    hasSession
      ? `SELECT
           mmc.metodo_cobro_id,
           mc.nombre as metodo_nombre,
           mc.tipo as metodo_tipo,
           CASE WHEN mon.codigo_iso = 'VES' THEN 'BS'
                ELSE COALESCE(mon.codigo_iso, 'USD') END as metodo_moneda,
           mmc.tipo as mov_tipo,
           mmc.origen,
           COALESCE(SUM(CAST(mmc.monto AS REAL)), 0) as total
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         LEFT JOIN monedas mon ON mc.moneda_id = mon.id
         WHERE mmc.empresa_id = ?
           AND mmc.sesion_caja_id IN (${placeholders})
         GROUP BY mmc.metodo_cobro_id, mc.nombre, mc.tipo, metodo_moneda, mmc.tipo, mmc.origen
         ORDER BY mc.nombre, mmc.tipo`
      : '',
    hasSession ? [empresaId, ...filters!.sesionCajaIds] : []
  )

  const items: MovimientoManualItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    metodo_cobro_id: String(row.metodo_cobro_id ?? ''),
    metodo_nombre: String(row.metodo_nombre ?? ''),
    metodo_tipo: String(row.metodo_tipo ?? ''),
    metodo_moneda: String(row.metodo_moneda ?? 'USD'),
    mov_tipo: String(row.mov_tipo ?? ''),
    origen: String(row.origen ?? ''),
    total: Number(Number(row.total ?? 0).toFixed(2)),
  }))

  return { movimientos: items, isLoading }
}

// ─── Apertura de Sesion para conteo fisico ─────────────────

export function useSesionApertura(filters: CuadreFilters | null) {
  const hasSession = !!filters && filters.sesionCajaIds.length > 0
  const placeholders = hasSession ? filters!.sesionCajaIds.map(() => '?').join(', ') : ''

  const { data, isLoading } = useQuery(
    hasSession
      ? `SELECT
           COALESCE(SUM(CAST(monto_apertura_usd AS REAL)), 0) as apertura_usd,
           COALESCE(SUM(CAST(monto_apertura_bs AS REAL)), 0) as apertura_bs
         FROM sesiones_caja
         WHERE id IN (${placeholders})`
      : '',
    hasSession ? filters!.sesionCajaIds : []
  )

  const row = (data?.[0] ?? {}) as { apertura_usd: number; apertura_bs: number }
  return {
    aperturaUsd: Number(Number(row.apertura_usd ?? 0).toFixed(2)),
    aperturaBs: Number(Number(row.apertura_bs ?? 0).toFixed(2)),
    isLoading,
  }
}

// ─── Saldo Esperado Efectivo Bimonetario ───────────────────
/**
 * Calcula el saldo esperado en caja para CADA divisa de forma independiente.
 * Formula por divisa: apertura + pagos_efectivo + ingresos_manuales - egresos_manuales
 * Los egresos incluyen vueltos (origen='VUELTO') porque se guardan en movimientos_metodo_cobro.
 * Solo aplica cuando hay exactamente sesionCajaIds definidos en filters.
 */
export function useSaldoEfectivoBimonetario(filters: CuadreFilters | null) {
  const hasSession = !!filters && filters.sesionCajaIds.length > 0
  const placeholders = hasSession ? filters!.sesionCajaIds.map(() => '?').join(', ') : ''

  // Montos de apertura por divisa
  const { data: dataApertura } = useQuery(
    hasSession
      ? `SELECT COALESCE(SUM(CAST(monto_apertura_usd AS REAL)), 0) as usd,
                COALESCE(SUM(CAST(monto_apertura_bs AS REAL)), 0) as bs
         FROM sesiones_caja WHERE id IN (${placeholders})`
      : '',
    hasSession ? filters!.sesionCajaIds : []
  )

  // Pagos efectivo USD (monto_usd = valor en USD)
  const { data: dataPagosUsd } = useQuery(
    hasSession
      ? `SELECT COALESCE(SUM(CAST(p.monto_usd AS REAL)), 0) as total
         FROM pagos p
         JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
         JOIN monedas mo ON mc.moneda_id = mo.id
         WHERE p.sesion_caja_id IN (${placeholders})
           AND mc.tipo = 'EFECTIVO' AND mo.codigo_iso = 'USD'`
      : '',
    hasSession ? filters!.sesionCajaIds : []
  )

  // Pagos efectivo VES (monto = valor nativo en Bs.)
  const { data: dataPagosVes } = useQuery(
    hasSession
      ? `SELECT COALESCE(SUM(CAST(p.monto AS REAL)), 0) as total
         FROM pagos p
         JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
         JOIN monedas mo ON mc.moneda_id = mo.id
         WHERE p.sesion_caja_id IN (${placeholders})
           AND mc.tipo = 'EFECTIVO' AND mo.codigo_iso = 'VES'`
      : '',
    hasSession ? filters!.sesionCajaIds : []
  )

  // Movimientos manuales efectivo USD (incluye VUELTO como EGRESO).
  // Excluye origen='VENTA' porque esos pagos ya se cuentan en dataPagosUsd.
  const { data: dataMovUsd } = useQuery(
    hasSession
      ? `SELECT
           COALESCE(SUM(CASE WHEN mmc.tipo = 'INGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) as total_ing,
           COALESCE(SUM(CASE WHEN mmc.tipo = 'EGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) as total_egr
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         JOIN monedas mo ON mc.moneda_id = mo.id
         WHERE mmc.sesion_caja_id IN (${placeholders})
           AND mc.tipo = 'EFECTIVO' AND mo.codigo_iso = 'USD'
           AND mmc.origen != 'VENTA'`
      : '',
    hasSession ? filters!.sesionCajaIds : []
  )

  // Movimientos manuales efectivo VES (incluye VUELTO como EGRESO).
  // Excluye origen='VENTA' porque esos pagos ya se cuentan en dataPagosVes.
  const { data: dataMovVes } = useQuery(
    hasSession
      ? `SELECT
           COALESCE(SUM(CASE WHEN mmc.tipo = 'INGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) as total_ing,
           COALESCE(SUM(CASE WHEN mmc.tipo = 'EGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) as total_egr
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         JOIN monedas mo ON mc.moneda_id = mo.id
         WHERE mmc.sesion_caja_id IN (${placeholders})
           AND mc.tipo = 'EFECTIVO' AND mo.codigo_iso = 'VES'
           AND mmc.origen != 'VENTA'`
      : '',
    hasSession ? filters!.sesionCajaIds : []
  )

  const aperRow = (dataApertura?.[0] ?? {}) as { usd: number; bs: number }
  const movUsdRow = (dataMovUsd?.[0] ?? {}) as { total_ing: number; total_egr: number }
  const movVesRow = (dataMovVes?.[0] ?? {}) as { total_ing: number; total_egr: number }

  const saldoEsperadoUsd = Number((
    Number(aperRow.usd ?? 0)
    + Number((dataPagosUsd?.[0] as { total: number } | undefined)?.total ?? 0)
    + Number(movUsdRow.total_ing ?? 0)
    - Number(movUsdRow.total_egr ?? 0)
  ).toFixed(2))

  const saldoEsperadoBs = Number((
    Number(aperRow.bs ?? 0)
    + Number((dataPagosVes?.[0] as { total: number } | undefined)?.total ?? 0)
    + Number(movVesRow.total_ing ?? 0)
    - Number(movVesRow.total_egr ?? 0)
  ).toFixed(2))

  return { saldoEsperadoUsd, saldoEsperadoBs }
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
           pg.fecha,
           CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mon.codigo_iso, 'USD') END as moneda
         FROM pagos pg
         JOIN ventas v ON pg.venta_id = v.id
         JOIN clientes c ON v.cliente_id = c.id
         JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
         LEFT JOIN monedas mon ON mp.moneda_id = mon.id
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

// ─── Totales Fiscales ──────────────────────────────────────

export interface TotalesFiscales {
  baseImponibleUsd: number
  baseImponibleBs: number
  totalExentoUsd: number
  totalExentoBs: number
  totalIvaUsd: number
  totalIvaBs: number
  totalIgtfUsd: number
  totalIgtfBs: number
  totalFacturadoUsd: number
  totalFacturadoBs: number
  totalDescuentoUsd: number
  totalDescuentoBs: number
  totalNcrUsd: number
  totalNcrBs: number
}

export function useTotalesFiscales(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [whereV, paramsV] = filters
    ? buildCuadreWhere(filters, empresaId)
    : ['1=0', []]

  const { data: dataVentas, isLoading: loadingVentas } = useQuery(
    `SELECT
       COALESCE(SUM(CAST(total_base_usd AS REAL)), 0) as base_imponible,
       COALESCE(SUM(CAST(total_base_usd AS REAL) * CAST(tasa AS REAL)), 0) as base_imponible_bs,
       COALESCE(SUM(CAST(total_exento_usd AS REAL)), 0) as total_exento,
       COALESCE(SUM(CAST(total_exento_usd AS REAL) * CAST(tasa AS REAL)), 0) as total_exento_bs,
       COALESCE(SUM(CAST(total_iva_usd AS REAL)), 0) as total_iva,
       COALESCE(SUM(CAST(total_iva_usd AS REAL) * CAST(tasa AS REAL)), 0) as total_iva_bs,
       COALESCE(SUM(CAST(total_igtf_usd AS REAL)), 0) as total_igtf,
       COALESCE(SUM(CAST(total_igtf_usd AS REAL) * CAST(tasa AS REAL)), 0) as total_igtf_bs,
       COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_facturado,
       COALESCE(SUM(CAST(total_bs AS REAL)), 0) as total_facturado_bs,
       COALESCE(SUM(CAST(COALESCE(descuento_usd, '0') AS REAL)), 0) as total_descuento,
       COALESCE(SUM(CAST(COALESCE(descuento_bs, '0') AS REAL)), 0) as total_descuento_bs
     FROM ventas
     WHERE ${whereV}`,
    paramsV
  )

  console.log('[useTotalesFiscales]', { empresaId, filters, whereV, paramsV, dataVentas, loadingVentas })

  const row = (dataVentas?.[0] ?? {}) as {
    base_imponible: number
    base_imponible_bs: number
    total_exento: number
    total_exento_bs: number
    total_iva: number
    total_iva_bs: number
    total_igtf: number
    total_igtf_bs: number
    total_facturado: number
    total_facturado_bs: number
    total_descuento: number
    total_descuento_bs: number
  }

  // NCR del mismo dia/sesion — usando fecha y empresa_id
  const { data: dataNcr, isLoading: loadingNcr } = useQuery(
    filters
      ? `SELECT
           COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_ncr,
           COALESCE(SUM(CAST(total_bs AS REAL)), 0) as total_ncr_bs
         FROM notas_credito
         WHERE empresa_id = ? AND DATE(fecha, 'localtime') = ?`
      : '',
    filters ? [empresaId, filters.fecha] : []
  )

  const ncrRow = (dataNcr?.[0] ?? {}) as { total_ncr: number; total_ncr_bs: number }

  return {
    totales: {
      baseImponibleUsd: Number(Number(row.base_imponible ?? 0).toFixed(2)),
      baseImponibleBs: Number(Number(row.base_imponible_bs ?? 0).toFixed(2)),
      totalExentoUsd: Number(Number(row.total_exento ?? 0).toFixed(2)),
      totalExentoBs: Number(Number(row.total_exento_bs ?? 0).toFixed(2)),
      totalIvaUsd: Number(Number(row.total_iva ?? 0).toFixed(2)),
      totalIvaBs: Number(Number(row.total_iva_bs ?? 0).toFixed(2)),
      totalIgtfUsd: Number(Number(row.total_igtf ?? 0).toFixed(2)),
      totalIgtfBs: Number(Number(row.total_igtf_bs ?? 0).toFixed(2)),
      totalFacturadoUsd: Number(Number(row.total_facturado ?? 0).toFixed(2)),
      totalFacturadoBs: Number(Number(row.total_facturado_bs ?? 0).toFixed(2)),
      totalDescuentoUsd: Number(Number(row.total_descuento ?? 0).toFixed(2)),
      totalDescuentoBs: Number(Number(row.total_descuento_bs ?? 0).toFixed(2)),
      totalNcrUsd: Number(Number(ncrRow.total_ncr ?? 0).toFixed(2)),
      totalNcrBs: Number(Number(ncrRow.total_ncr_bs ?? 0).toFixed(2)),
    } as TotalesFiscales,
    isLoading: loadingVentas || loadingNcr,
  }
}

// ─── IVA por Alicuota ──────────────────────────────────────

export interface IvaAlicuota {
  impuestoPct: number
  baseUsd: number
  baseBs: number
  montoIvaUsd: number
  montoIvaBs: number
}

export function useIvaPorAlicuota(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhereViaVenta(filters, empresaId, 'v')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       CAST(dv.impuesto_pct AS REAL) as impuesto_pct,
       COALESCE(SUM(CAST(dv.subtotal_usd AS REAL)), 0) as base_usd,
       COALESCE(SUM(CAST(dv.subtotal_usd AS REAL) * CAST(v.tasa AS REAL)), 0) as base_bs,
       COALESCE(SUM(CAST(dv.subtotal_usd AS REAL) * CAST(dv.impuesto_pct AS REAL) / 100), 0) as monto_iva,
       COALESCE(SUM(CAST(dv.subtotal_usd AS REAL) * CAST(dv.impuesto_pct AS REAL) / 100 * CAST(v.tasa AS REAL)), 0) as monto_iva_bs
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     WHERE ${where}
       AND dv.tipo_impuesto != 'EXENTO'
       AND CAST(dv.impuesto_pct AS REAL) > 0
     GROUP BY dv.impuesto_pct
     ORDER BY dv.impuesto_pct DESC`,
    params
  )

  const items: IvaAlicuota[] = (data ?? []).map((row: Record<string, unknown>) => ({
    impuestoPct: Number(row.impuesto_pct ?? 0),
    baseUsd: Number(Number(row.base_usd ?? 0).toFixed(2)),
    baseBs: Number(Number(row.base_bs ?? 0).toFixed(2)),
    montoIvaUsd: Number(Number(row.monto_iva ?? 0).toFixed(2)),
    montoIvaBs: Number(Number(row.monto_iva_bs ?? 0).toFixed(2)),
  }))

  return { alicuotas: items, isLoading }
}

// ─── Pagos Detalle Completo ────────────────────────────────

export interface PagoDetalleCompleto {
  id: string
  ventaId: string | null
  nroFactura: string | null
  clienteNombre: string | null
  metodoNombre: string
  metodoCobro_id: string
  metodoTipo: string
  moneda: string
  monto: string
  montoUsd: string
  referencia: string | null
  fecha: string
}

export function usePagosDetalleCompleto(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhere(filters, empresaId, 'pg')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    `SELECT
       pg.id,
       pg.venta_id,
       pg.monto,
       pg.monto_usd,
       pg.referencia,
       pg.fecha,
       pg.metodo_cobro_id,
       v.nro_factura,
       c.nombre as cliente_nombre,
       mp.nombre as metodo_nombre,
       mp.tipo as metodo_tipo,
       CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mon.codigo_iso, 'USD') END as moneda
     FROM pagos pg
     LEFT JOIN ventas v ON pg.venta_id = v.id
     LEFT JOIN clientes c ON pg.cliente_id = c.id
     JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
     LEFT JOIN monedas mon ON mp.moneda_id = mon.id
     WHERE ${where}
     ORDER BY pg.fecha DESC`,
    params
  )

  const items: PagoDetalleCompleto[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    ventaId: row.venta_id ? String(row.venta_id) : null,
    nroFactura: row.nro_factura ? String(row.nro_factura) : null,
    clienteNombre: row.cliente_nombre ? String(row.cliente_nombre) : null,
    metodoNombre: String(row.metodo_nombre ?? ''),
    metodoCobro_id: String(row.metodo_cobro_id ?? ''),
    metodoTipo: String(row.metodo_tipo ?? ''),
    moneda: String(row.moneda ?? 'USD'),
    monto: String(row.monto ?? '0'),
    montoUsd: String(row.monto_usd ?? '0'),
    referencia: row.referencia ? String(row.referencia) : null,
    fecha: String(row.fecha ?? ''),
  }))

  return { pagos: items, isLoading }
}

// ─── Busqueda de Facturas ──────────────────────────────────

export interface FacturaBusqueda {
  id: string
  nroFactura: string
  clienteNombre: string
  clienteIdentificacion: string
  totalUsd: string
  totalBs: string
  tipo: string
  status: string
  fecha: string
}

export interface BusquedaParams {
  empresaId: string
  fechaInicio: string
  fechaFin: string
  busqFactura: string
  busqCliente: string
}

export function useFacturasBusqueda(params: BusquedaParams | null) {
  const clauses: string[] = []
  const sqlParams: unknown[] = []

  if (params) {
    clauses.push('v.empresa_id = ?')
    sqlParams.push(params.empresaId)

    clauses.push("DATE(v.fecha, 'localtime') >= ?")
    sqlParams.push(params.fechaInicio)

    clauses.push("DATE(v.fecha, 'localtime') <= ?")
    sqlParams.push(params.fechaFin)

    if (params.busqFactura.trim()) {
      clauses.push("v.nro_factura LIKE ?")
      sqlParams.push(`%${params.busqFactura.trim()}%`)
    }

    if (params.busqCliente.trim()) {
      clauses.push("(c.nombre LIKE ? OR c.identificacion LIKE ?)")
      sqlParams.push(`%${params.busqCliente.trim()}%`, `%${params.busqCliente.trim()}%`)
    }
  }

  const where = clauses.length > 0 ? clauses.join(' AND ') : '1=0'

  const { data, isLoading } = useQuery(
    params
      ? `SELECT
           v.id, v.nro_factura, v.total_usd, v.total_bs, v.tipo, v.status, v.fecha,
           c.nombre as cliente_nombre,
           c.identificacion as cliente_identificacion
         FROM ventas v
         JOIN clientes c ON v.cliente_id = c.id
         WHERE ${where}
         ORDER BY v.fecha DESC
         LIMIT 200`
      : '',
    params ? sqlParams : []
  )

  const items: FacturaBusqueda[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    nroFactura: String(row.nro_factura ?? ''),
    clienteNombre: String(row.cliente_nombre ?? ''),
    clienteIdentificacion: String(row.cliente_identificacion ?? ''),
    totalUsd: String(row.total_usd ?? '0'),
    totalBs: String(row.total_bs ?? '0'),
    tipo: String(row.tipo ?? ''),
    status: String(row.status ?? ''),
    fecha: String(row.fecha ?? ''),
  }))

  return { facturas: items, isLoading }
}

// ─── Cobros efectivo individuales (para saldo de caja) ─────

export interface CobrosEfectivoDetalle {
  id: string
  nro_factura: string
  cliente_nombre: string
  monto: string
  moneda: string
  metodo_nombre: string
  fecha: string
}

export function useCobrosEfectivoCaja(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [where, params] = filters
    ? buildCuadreWhere(filters, empresaId, 'pg')
    : ['1=0', []]

  const { data, isLoading } = useQuery(
    filters
      ? `SELECT
           pg.id, pg.monto, pg.fecha,
           v.nro_factura,
           c.nombre as cliente_nombre,
           mp.nombre as metodo_nombre,
           CASE WHEN mon.codigo_iso = 'VES' THEN 'BS'
                ELSE COALESCE(mon.codigo_iso, 'USD') END as moneda
         FROM pagos pg
         JOIN ventas v ON pg.venta_id = v.id
         JOIN clientes c ON v.cliente_id = c.id
         JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
         LEFT JOIN monedas mon ON mp.moneda_id = mon.id
         WHERE ${where}
           AND mp.tipo = 'EFECTIVO'
           AND pg.is_reversed = 0
         ORDER BY pg.fecha DESC`
      : '',
    filters ? params : []
  )

  const items: CobrosEfectivoDetalle[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    nro_factura: String(row.nro_factura ?? ''),
    cliente_nombre: String(row.cliente_nombre ?? ''),
    monto: String(row.monto ?? '0'),
    moneda: String(row.moneda ?? 'USD'),
    metodo_nombre: String(row.metodo_nombre ?? ''),
    fecha: String(row.fecha ?? ''),
  }))

  return { cobros: items, isLoading }
}

// ─── Movimientos efectivo individuales (para saldo de caja) ─

export interface MovimientoEfectivoDetalle {
  id: string
  origen: string
  tipo: string
  monto: string
  metodo_nombre: string
  metodo_moneda: string
  concepto: string | null
  fecha: string
  destinatario: string | null
}

export function useMovimientosEfectivoCaja(filters: CuadreFilters | null) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const hasSession = !!filters && filters.sesionCajaIds.length > 0
  const placeholders = hasSession ? filters!.sesionCajaIds.map(() => '?').join(', ') : ''

  const { data, isLoading } = useQuery(
    hasSession
      ? `SELECT
           mmc.id, mmc.origen, mmc.tipo, mmc.monto, mmc.concepto, mmc.fecha,
           mc.nombre as metodo_nombre,
           CASE WHEN mon.codigo_iso = 'VES' THEN 'BS'
                ELSE COALESCE(mon.codigo_iso, 'USD') END as metodo_moneda,
           ud.nombre as destinatario
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         LEFT JOIN monedas mon ON mc.moneda_id = mon.id
         LEFT JOIN usuarios ud ON mmc.destinatario_id = ud.id
         WHERE mmc.empresa_id = ?
           AND mmc.sesion_caja_id IN (${placeholders})
           AND mc.tipo = 'EFECTIVO'
         ORDER BY mmc.fecha DESC`
      : '',
    hasSession ? [empresaId, ...filters!.sesionCajaIds] : []
  )

  const items: MovimientoEfectivoDetalle[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    origen: String(row.origen ?? ''),
    tipo: String(row.tipo ?? ''),
    monto: String(row.monto ?? '0'),
    metodo_nombre: String(row.metodo_nombre ?? ''),
    metodo_moneda: String(row.metodo_moneda ?? 'USD'),
    concepto: row.concepto ? String(row.concepto) : null,
    fecha: String(row.fecha ?? ''),
    destinatario: row.destinatario ? String(row.destinatario) : null,
  }))

  return { movimientos: items, isLoading }
}
