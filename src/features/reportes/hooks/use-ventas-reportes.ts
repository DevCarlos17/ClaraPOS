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
  productoId: string
  codigo: string
  nombre: string
  cantidad: number
  totalUsd: number
}

export interface TopClienteVentas {
  clienteId: string
  nombre: string
  identificacion: string
  facturas: number
  totalUsd: number
}

export interface FacturaCliente {
  nroFactura: string
  fecha: string
  totalUsd: number
  totalBs: number
  status: string
}

export interface VentaProducto {
  nroFactura: string
  clienteNombre: string
  fecha: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}

export interface FacturaReporte {
  nroFactura: string
  fecha: string
  clienteNombre: string
  totalUsd: number
  totalBs: number
  status: string
}

export interface DetalleFacturaReporte {
  nroFactura: string
  productoCodigo: string
  productoNombre: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}

export interface DevolucionResumen {
  totalUsd: number
  totalBs: number
  cantidad: number
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
       p.id as producto_id,
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
    productoId: String(row.producto_id ?? ''),
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
       c.id as cliente_id,
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
    clienteId: String(row.cliente_id ?? ''),
    nombre: String(row.nombre ?? ''),
    identificacion: String(row.identificacion ?? ''),
    facturas: Number(row.facturas ?? 0),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { clientes: items, isLoading }
}

// ─── Detalle facturas por cliente ───────────────────────────

export function useFacturasCliente(clienteId: string, fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const enabled = !!clienteId && !!empresaId

  const { data, isLoading } = useQuery(
    enabled
      ? `SELECT
           nro_factura, fecha,
           CAST(total_usd AS REAL) as total_usd,
           CAST(total_bs AS REAL) as total_bs,
           status
         FROM ventas
         WHERE empresa_id = ? AND cliente_id = ?
           AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?
         ORDER BY fecha DESC`
      : '',
    enabled ? [empresaId, clienteId, fechaDesde, fechaHasta] : []
  )

  const items: FacturaCliente[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nroFactura: String(row.nro_factura ?? ''),
    fecha: String(row.fecha ?? ''),
    totalUsd: Number(row.total_usd ?? 0),
    totalBs: Number(row.total_bs ?? 0),
    status: String(row.status ?? ''),
  }))

  return { facturas: items, isLoading }
}

// ─── Detalle ventas por producto ────────────────────────────

export function useVentasProducto(productoId: string, fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const enabled = !!productoId && !!empresaId

  const { data, isLoading } = useQuery(
    enabled
      ? `SELECT
           v.nro_factura,
           COALESCE(c.nombre, 'Sin cliente') as cliente_nombre,
           v.fecha,
           CAST(dv.cantidad AS REAL) as cantidad,
           CAST(dv.precio_unitario_usd AS REAL) as precio_unitario,
           CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL) as subtotal
         FROM ventas_det dv
         JOIN ventas v ON dv.venta_id = v.id
         LEFT JOIN clientes c ON v.cliente_id = c.id
         WHERE v.empresa_id = ? AND dv.producto_id = ?
           AND SUBSTR(v.fecha, 1, 10) >= ? AND SUBSTR(v.fecha, 1, 10) <= ?
         ORDER BY v.fecha DESC`
      : '',
    enabled ? [empresaId, productoId, fechaDesde, fechaHasta] : []
  )

  const items: VentaProducto[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nroFactura: String(row.nro_factura ?? ''),
    clienteNombre: String(row.cliente_nombre ?? ''),
    fecha: String(row.fecha ?? ''),
    cantidad: Number(row.cantidad ?? 0),
    precioUnitario: Number(row.precio_unitario ?? 0),
    subtotal: Number(row.subtotal ?? 0),
  }))

  return { ventas: items, isLoading }
}

// ─── Todas las facturas del periodo (para PDF) ─────────────

export function useFacturasReporte(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       v.nro_factura,
       v.fecha,
       COALESCE(c.nombre, 'Sin cliente') as cliente_nombre,
       CAST(v.total_usd AS REAL) as total_usd,
       CAST(v.total_bs AS REAL) as total_bs,
       v.status
     FROM ventas v
     LEFT JOIN clientes c ON v.cliente_id = c.id
     WHERE v.empresa_id = ? AND SUBSTR(v.fecha, 1, 10) >= ? AND SUBSTR(v.fecha, 1, 10) <= ?
     ORDER BY v.fecha ASC, v.nro_factura ASC`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const items: FacturaReporte[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nroFactura: String(row.nro_factura ?? ''),
    fecha: String(row.fecha ?? ''),
    clienteNombre: String(row.cliente_nombre ?? ''),
    totalUsd: Number(row.total_usd ?? 0),
    totalBs: Number(row.total_bs ?? 0),
    status: String(row.status ?? ''),
  }))

  return { facturas: items, isLoading }
}

// ─── Detalle de articulos por factura (para PDF) ────────────

export function useDetalleFacturasReporte(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       v.nro_factura,
       p.codigo as producto_codigo,
       p.nombre as producto_nombre,
       CAST(dv.cantidad AS REAL) as cantidad,
       CAST(dv.precio_unitario_usd AS REAL) as precio_unitario,
       CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL) as subtotal
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE v.empresa_id = ? AND SUBSTR(v.fecha, 1, 10) >= ? AND SUBSTR(v.fecha, 1, 10) <= ?
     ORDER BY v.nro_factura ASC, p.nombre ASC`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const items: DetalleFacturaReporte[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nroFactura: String(row.nro_factura ?? ''),
    productoCodigo: String(row.producto_codigo ?? ''),
    productoNombre: String(row.producto_nombre ?? ''),
    cantidad: Number(row.cantidad ?? 0),
    precioUnitario: Number(row.precio_unitario ?? 0),
    subtotal: Number(row.subtotal ?? 0),
  }))

  return { detalles: items, isLoading }
}

// ─── Devoluciones (Notas de Credito) ────────────────────────

export function useDevolucionesRango(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       COUNT(*) as cantidad,
       COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_usd,
       COALESCE(SUM(CAST(total_bs AS REAL)), 0) as total_bs
     FROM notas_credito
     WHERE empresa_id = ? AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?`,
    [empresaId, fechaDesde, fechaHasta]
  )

  const row = (data?.[0] ?? {}) as { cantidad: number; total_usd: number; total_bs: number }

  return {
    devoluciones: {
      totalUsd: Number(row.total_usd ?? 0),
      totalBs: Number(row.total_bs ?? 0),
      cantidad: Number(row.cantidad ?? 0),
    } as DevolucionResumen,
    isLoading,
  }
}

// ─── Buscar facturas por numero ─────────────────────────────

export interface FacturaBusqueda {
  id: string
  nroFactura: string
  clienteNombre: string
  clienteIdentificacion: string
  fecha: string
  totalUsd: number
  totalBs: number
  tasa: number
  tipo: string
  status: string
  saldoPendUsd: number
}

export function useBuscarFacturas(query: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const searchTerm = query.trim()
  const shouldSearch = searchTerm.length >= 1

  const { data, isLoading } = useQuery(
    shouldSearch
      ? `SELECT
           v.id, v.nro_factura, v.fecha, v.tasa,
           CAST(v.total_usd AS REAL) as total_usd,
           CAST(v.total_bs AS REAL) as total_bs,
           CAST(v.saldo_pend_usd AS REAL) as saldo_pend_usd,
           v.tipo, v.status,
           COALESCE(c.nombre, 'Sin cliente') as cliente_nombre,
           COALESCE(c.identificacion, '') as cliente_identificacion
         FROM ventas v
         LEFT JOIN clientes c ON v.cliente_id = c.id
         WHERE v.empresa_id = ? AND v.nro_factura LIKE ?
         ORDER BY v.fecha DESC
         LIMIT 20`
      : '',
    shouldSearch ? [empresaId, `%${searchTerm}%`] : []
  )

  const items: FacturaBusqueda[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    nroFactura: String(row.nro_factura ?? ''),
    clienteNombre: String(row.cliente_nombre ?? ''),
    clienteIdentificacion: String(row.cliente_identificacion ?? ''),
    fecha: String(row.fecha ?? ''),
    totalUsd: Number(row.total_usd ?? 0),
    totalBs: Number(row.total_bs ?? 0),
    tasa: Number(row.tasa ?? 0),
    tipo: String(row.tipo ?? ''),
    status: String(row.status ?? ''),
    saldoPendUsd: Number(row.saldo_pend_usd ?? 0),
  }))

  return { facturas: items, isLoading }
}

// ─── Facturas por cliente (sin rango de fecha) ──────────────

export function useFacturasPorCliente(clienteId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const enabled = !!clienteId && !!empresaId

  const { data, isLoading } = useQuery(
    enabled
      ? `SELECT
           v.id, v.nro_factura, v.fecha, v.tasa,
           CAST(v.total_usd AS REAL) as total_usd,
           CAST(v.total_bs AS REAL) as total_bs,
           CAST(v.saldo_pend_usd AS REAL) as saldo_pend_usd,
           v.tipo, v.status,
           COALESCE(c.nombre, 'Sin cliente') as cliente_nombre,
           COALESCE(c.identificacion, '') as cliente_identificacion
         FROM ventas v
         LEFT JOIN clientes c ON v.cliente_id = c.id
         WHERE v.empresa_id = ? AND v.cliente_id = ?
         ORDER BY v.fecha DESC
         LIMIT 50`
      : '',
    enabled ? [empresaId, clienteId] : []
  )

  const items: FacturaBusqueda[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ''),
    nroFactura: String(row.nro_factura ?? ''),
    clienteNombre: String(row.cliente_nombre ?? ''),
    clienteIdentificacion: String(row.cliente_identificacion ?? ''),
    fecha: String(row.fecha ?? ''),
    totalUsd: Number(row.total_usd ?? 0),
    totalBs: Number(row.total_bs ?? 0),
    tasa: Number(row.tasa ?? 0),
    tipo: String(row.tipo ?? ''),
    status: String(row.status ?? ''),
    saldoPendUsd: Number(row.saldo_pend_usd ?? 0),
  }))

  return { facturas: items, isLoading }
}

// ─── Ventas por producto (sin rango de fecha) ───────────────

export interface VentaProductoGlobal {
  nroFactura: string
  clienteNombre: string
  fecha: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}

export function useVentasPorProducto(productoId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const enabled = !!productoId && !!empresaId

  const { data, isLoading } = useQuery(
    enabled
      ? `SELECT
           v.nro_factura,
           COALESCE(c.nombre, 'Sin cliente') as cliente_nombre,
           v.fecha,
           CAST(dv.cantidad AS REAL) as cantidad,
           CAST(dv.precio_unitario_usd AS REAL) as precio_unitario,
           CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL) as subtotal
         FROM ventas_det dv
         JOIN ventas v ON dv.venta_id = v.id
         LEFT JOIN clientes c ON v.cliente_id = c.id
         WHERE v.empresa_id = ? AND dv.producto_id = ?
         ORDER BY v.fecha DESC
         LIMIT 50`
      : '',
    enabled ? [empresaId, productoId] : []
  )

  const items: VentaProductoGlobal[] = (data ?? []).map((row: Record<string, unknown>) => ({
    nroFactura: String(row.nro_factura ?? ''),
    clienteNombre: String(row.cliente_nombre ?? ''),
    fecha: String(row.fecha ?? ''),
    cantidad: Number(row.cantidad ?? 0),
    precioUnitario: Number(row.precio_unitario ?? 0),
    subtotal: Number(row.subtotal ?? 0),
  }))

  return { ventas: items, isLoading }
}
