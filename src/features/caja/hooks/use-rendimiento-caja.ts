import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interface ───────────────────────────────────────────────

export interface SesionHistorialRendimiento {
  id: string
  caja_id: string
  caja_nombre: string | null
  cajera_nombre: string | null
  fecha_apertura: string
  fecha_cierre: string | null
  monto_apertura_usd: string
  monto_apertura_bs: string
  // Estadisticas
  totalFacturas: number
  totalFacturadoUsd: number
  totalArticulos: number
  // KPIs calculados
  duracionHoras: number
  factHora: number
  atv: number
  itemsHora: number
  upt: number
}

// ─── Hook ────────────────────────────────────────────────────

/**
 * Retorna las sesiones CERRADAS mas recientes con KPIs de rendimiento calculados.
 * Incluye nombre de caja y cajera, estadisticas de ventas y KPIs derivados:
 *   - factHora: facturas procesadas por hora de sesion
 *   - atv: ticket promedio en USD por factura (Average Transaction Value)
 *   - itemsHora: articulos procesados por hora
 *   - upt: articulos por factura (Units Per Transaction)
 *   - duracionHoras: duracion total de la sesion en horas
 */
export function useHistorialRendimiento(limite: number = 10) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // Q1: Sesiones CERRADAS con nombre de caja y cajera
  const { data: sesionesData, isLoading: l1 } = useQuery(
    empresaId
      ? `SELECT s.id, s.caja_id, s.fecha_apertura, s.fecha_cierre,
                s.monto_apertura_usd, s.monto_apertura_bs,
                c.nombre as caja_nombre,
                u.nombre as cajera_nombre
         FROM sesiones_caja s
         LEFT JOIN cajas c ON c.id = s.caja_id
         LEFT JOIN usuarios u ON u.id = s.usuario_apertura_id
         WHERE s.empresa_id = ? AND s.status = 'CERRADA'
         ORDER BY s.fecha_apertura DESC
         LIMIT ?`
      : '',
    empresaId ? [empresaId, limite] : []
  )

  type SesionHRow = {
    id: string
    caja_id: string
    fecha_apertura: string
    fecha_cierre: string | null
    monto_apertura_usd: string
    monto_apertura_bs: string
    caja_nombre: string | null
    cajera_nombre: string | null
  }

  const sesionesBase = (sesionesData ?? []) as SesionHRow[]
  const sesionIds = sesionesBase.map((s) => s.id)
  const inPh = sesionIds.map(() => '?').join(', ')
  const hasIds = sesionIds.length > 0

  // Q2: Estadisticas de ventas por sesion
  const { data: ventasData, isLoading: l2 } = useQuery(
    hasIds
      ? `SELECT sesion_caja_id,
               COUNT(*) as total_facturas,
               COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_facturado_usd
         FROM ventas
         WHERE sesion_caja_id IN (${inPh}) AND status != 'ANULADA'
         GROUP BY sesion_caja_id`
      : '',
    hasIds ? sesionIds : []
  )

  // Q3: Articulos por sesion
  const { data: artsData, isLoading: l3 } = useQuery(
    hasIds
      ? `SELECT v.sesion_caja_id,
               COALESCE(SUM(CAST(vd.cantidad AS REAL)), 0) as total_articulos
         FROM ventas v
         JOIN ventas_det vd ON vd.venta_id = v.id
         WHERE v.sesion_caja_id IN (${inPh}) AND v.status != 'ANULADA'
         GROUP BY v.sesion_caja_id`
      : '',
    hasIds ? sesionIds : []
  )

  // ─── Mapas de lookup ─────────────────────────────────────────

  type VentasRow = {
    sesion_caja_id: string
    total_facturas: number
    total_facturado_usd: number
  }
  const ventasMap = new Map<string, { facturas: number; facturado: number }>()
  for (const r of (ventasData ?? []) as VentasRow[]) {
    ventasMap.set(r.sesion_caja_id, {
      facturas: r.total_facturas,
      facturado: r.total_facturado_usd,
    })
  }

  type ArtsRow = { sesion_caja_id: string; total_articulos: number }
  const artsMap = new Map<string, number>()
  for (const r of (artsData ?? []) as ArtsRow[]) {
    artsMap.set(r.sesion_caja_id, r.total_articulos)
  }

  // ─── Calcular KPIs ───────────────────────────────────────────

  const sesiones: SesionHistorialRendimiento[] = sesionesBase.map((s) => {
    const v = ventasMap.get(s.id) ?? { facturas: 0, facturado: 0 }
    const arts = artsMap.get(s.id) ?? 0

    const apertura = new Date(s.fecha_apertura).getTime()
    const cierre = s.fecha_cierre ? new Date(s.fecha_cierre).getTime() : Date.now()
    const duracionHoras = Math.max(0.1, (cierre - apertura) / 3_600_000)
    const totalArticulos = Math.round(arts)

    return {
      id: s.id,
      caja_id: s.caja_id,
      caja_nombre: s.caja_nombre ?? null,
      cajera_nombre: s.cajera_nombre ?? null,
      fecha_apertura: s.fecha_apertura,
      fecha_cierre: s.fecha_cierre,
      monto_apertura_usd: s.monto_apertura_usd,
      monto_apertura_bs: s.monto_apertura_bs,
      totalFacturas: v.facturas,
      totalFacturadoUsd: v.facturado,
      totalArticulos,
      duracionHoras,
      factHora: v.facturas / duracionHoras,
      atv: v.facturas > 0 ? v.facturado / v.facturas : 0,
      itemsHora: totalArticulos / duracionHoras,
      upt: v.facturas > 0 ? totalArticulos / v.facturas : 0,
    }
  })

  return { sesiones, isLoading: l1 || l2 || l3 }
}
