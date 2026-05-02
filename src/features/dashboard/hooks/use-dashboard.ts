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

// ─── DEBUG: Diagnostico de datos ───────────────────────────
// TODO: Remover cuando se resuelva el problema de visualizacion

export function useDebugVentas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // 1. Total de ventas SIN ningun filtro
  const { data: allVentas } = useQuery(
    `SELECT COUNT(*) as cnt FROM ventas`,
    []
  )

  // 2. Total de ventas con filtro de empresa_id
  const { data: empresaVentas } = useQuery(
    empresaId ? `SELECT COUNT(*) as cnt FROM ventas WHERE empresa_id = ?` : '',
    empresaId ? [empresaId] : []
  )

  // 3. Primeros 5 registros de ventas para ver el formato de fecha
  const { data: sampleVentas } = useQuery(
    `SELECT id, empresa_id, fecha, total_usd, SUBSTR(fecha, 1, 10) as fecha_corta FROM ventas ORDER BY fecha DESC LIMIT 5`,
    []
  )

  // 4. Empresas distintas en ventas
  const { data: empresasEnVentas } = useQuery(
    `SELECT DISTINCT empresa_id FROM ventas LIMIT 10`,
    []
  )

  console.group('🔍 DEBUG VENTAS')
  console.log('empresa_id del usuario:', empresaId)
  console.log('user completo:', user)
  console.log('Total ventas (sin filtro):', (allVentas?.[0] as Record<string, unknown>)?.cnt)
  console.log('Total ventas (con empresa_id):', (empresaVentas?.[0] as Record<string, unknown>)?.cnt)
  console.log('Sample ventas (ultimas 5):', sampleVentas)
  console.log('Empresas distintas en ventas:', empresasEnVentas)
  console.groupEnd()

  return {
    totalSinFiltro: Number((allVentas?.[0] as Record<string, unknown>)?.cnt ?? 0),
    totalConEmpresa: Number((empresaVentas?.[0] as Record<string, unknown>)?.cnt ?? 0),
    sampleVentas: sampleVentas ?? [],
    empresasEnVentas: empresasEnVentas ?? [],
    empresaIdUsado: empresaId,
  }
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
     WHERE p.empresa_id = ? AND p.is_active = 1 AND p.tipo = 'P'
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
  const { data, isLoading } = useQuery(
    `SELECT
       SUBSTR(fecha, 1, 10) as dia,
       COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_usd
     FROM ventas
     WHERE empresa_id = ? AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?
     GROUP BY SUBSTR(fecha, 1, 10)
     ORDER BY dia ASC`,
    [empresaId, fechaInicio, fechaFin]
  )

  console.log('📊 useVentasRango:', { empresaId, fechaInicio, fechaFin, rawData: data, isLoading })

  const items: VentaDiaria[] = (data ?? []).map((row: Record<string, unknown>) => ({
    dia: String(row.dia ?? ''),
    totalUsd: Number(Number(row.total_usd ?? 0).toFixed(2)),
  }))

  return { ventas: items, isLoading }
}

// ─── Top Productos por Rango ──────────────────────────────

// ─── Prestamos / Vencimientos Cobrar ──────────────────────────

export interface VencimientoPrestamo {
  id: string
  venta_id: string
  cliente_id: string
  cliente_nombre: string
  nro_factura: string
  fecha_vencimiento: string
  saldo_pendiente_usd: string
  dias_restantes: number   // negativo = vencido
}

export function usePrestamosProximos(diasAdelanto = 7) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const limitStr = new Date(today.getTime() + diasAdelanto * 86400000).toISOString().split('T')[0]

  const { data, isLoading } = useQuery(
    empresaId
      ? `SELECT vc.id, vc.venta_id, vc.cliente_id, vc.fecha_vencimiento,
               vc.saldo_pendiente_usd,
               v.nro_factura,
               c.nombre as cliente_nombre
         FROM vencimientos_cobrar vc
         JOIN ventas v ON vc.venta_id = v.id
         JOIN clientes c ON vc.cliente_id = c.id
         WHERE vc.empresa_id = ? AND vc.status = 'PENDIENTE'
           AND CAST(vc.saldo_pendiente_usd AS REAL) > 0.01
           AND vc.fecha_vencimiento <= ?
         ORDER BY vc.fecha_vencimiento ASC`
      : '',
    empresaId ? [empresaId, limitStr] : []
  )

  const items: VencimientoPrestamo[] = (data ?? []).map((row: Record<string, unknown>) => {
    const fechaVenc = String(row.fecha_vencimiento ?? '')
    const diff = Math.floor(
      (new Date(fechaVenc).getTime() - new Date(todayStr).getTime()) / 86400000
    )
    return {
      id: String(row.id ?? ''),
      venta_id: String(row.venta_id ?? ''),
      cliente_id: String(row.cliente_id ?? ''),
      cliente_nombre: String(row.cliente_nombre ?? ''),
      nro_factura: String(row.nro_factura ?? ''),
      fecha_vencimiento: fechaVenc,
      saldo_pendiente_usd: String(row.saldo_pendiente_usd ?? '0'),
      dias_restantes: diff,
    }
  })

  return { vencimientos: items, isLoading }
}

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
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  const endStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const { data, isLoading } = useQuery(
    `SELECT
       p.nombre,
       p.codigo,
       COALESCE(SUM(CAST(dv.cantidad AS REAL)), 0) as cantidad,
       COALESCE(SUM(CAST(dv.precio_unitario_usd AS REAL) * CAST(dv.cantidad AS REAL)), 0) as total_usd
     FROM ventas_det dv
     JOIN ventas v ON dv.venta_id = v.id
     JOIN productos p ON dv.producto_id = p.id
     WHERE v.empresa_id = ? AND SUBSTR(v.fecha, 1, 10) >= ? AND SUBSTR(v.fecha, 1, 10) <= ?
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
