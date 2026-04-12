import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

// ─── Interfaces ─────────────────────────────────────────────

export interface RetencionIslrVenta {
  id: string
  empresa_id: string
  venta_id: string
  cliente_id: string
  concepto_islr_id: string | null
  nro_comprobante: string
  fecha_comprobante: string
  periodo_fiscal: string | null
  base_imponible_bs: string
  porcentaje_retencion: string
  monto_retenido_bs: string
  sustraendo_bs: string | null
  status: string
  observaciones: string | null
  created_at: string
  created_by: string | null
}

export interface CrearRetencionIslrVentaParams {
  venta_id: string
  cliente_id: string
  concepto_islr_id?: string
  nro_comprobante: string
  fecha_comprobante: string
  periodo_fiscal?: string
  base_imponible_bs: number
  porcentaje_retencion: number
  monto_retenido_bs: number
  sustraendo_bs?: number
  status?: string
  observaciones?: string
  empresa_id: string
  usuario_id: string
}

// ─── Hook de lectura ─────────────────────────────────────────

/**
 * Retorna las retenciones de ISLR sobre ventas de la empresa actual.
 * Filtra opcionalmente por rango de fechas (fecha_comprobante).
 */
export function useRetencionesIslrVentas(fechaDesde?: string, fechaHasta?: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hayFiltroFechas = fechaDesde !== undefined || fechaHasta !== undefined

  const query = (() => {
    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return `SELECT * FROM retenciones_islr_ventas
              WHERE empresa_id = ?
                AND fecha_comprobante >= ? AND fecha_comprobante <= ?
              ORDER BY fecha_comprobante DESC`
    }

    if (hayFiltroFechas && fechaDesde) {
      return `SELECT * FROM retenciones_islr_ventas
              WHERE empresa_id = ? AND fecha_comprobante >= ?
              ORDER BY fecha_comprobante DESC`
    }

    if (hayFiltroFechas && fechaHasta) {
      return `SELECT * FROM retenciones_islr_ventas
              WHERE empresa_id = ? AND fecha_comprobante <= ?
              ORDER BY fecha_comprobante DESC`
    }

    return `SELECT * FROM retenciones_islr_ventas
            WHERE empresa_id = ?
            ORDER BY fecha_comprobante DESC`
  })()

  const params = (() => {
    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return [empresaId, fechaDesde, fechaHasta]
    }
    if (hayFiltroFechas && fechaDesde) return [empresaId, fechaDesde]
    if (hayFiltroFechas && fechaHasta) return [empresaId, fechaHasta]
    return [empresaId]
  })()

  const { data, isLoading } = useQuery(query, params)

  return { retenciones: (data ?? []) as RetencionIslrVenta[], isLoading }
}

// ─── Funcion: crearRetencionIslrVenta ────────────────────────

/**
 * Registra una retencion de ISLR sobre una venta.
 * Los montos se manejan en Bolivares (moneda local).
 * El status inicial es 'REGISTRADA' salvo que se especifique otro.
 */
export async function crearRetencionIslrVenta(
  params: CrearRetencionIslrVentaParams
): Promise<string> {
  const {
    venta_id,
    cliente_id,
    concepto_islr_id,
    nro_comprobante,
    fecha_comprobante,
    periodo_fiscal,
    base_imponible_bs,
    porcentaje_retencion,
    monto_retenido_bs,
    sustraendo_bs,
    status,
    observaciones,
    empresa_id,
    usuario_id,
  } = params

  if (base_imponible_bs <= 0) throw new Error('La base imponible debe ser mayor a 0')
  if (monto_retenido_bs <= 0) throw new Error('El monto retenido debe ser mayor a 0')

  const id = uuidv4()
  const now = new Date().toISOString()
  const statusFinal = status ?? 'REGISTRADA'

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO retenciones_islr_ventas (
         id, empresa_id, venta_id, cliente_id, concepto_islr_id,
         nro_comprobante, fecha_comprobante, periodo_fiscal,
         base_imponible_bs, porcentaje_retencion, monto_retenido_bs,
         sustraendo_bs, status, observaciones, created_at, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        empresa_id,
        venta_id,
        cliente_id,
        concepto_islr_id ?? null,
        nro_comprobante,
        fecha_comprobante,
        periodo_fiscal ?? null,
        base_imponible_bs.toFixed(2),
        porcentaje_retencion.toFixed(2),
        monto_retenido_bs.toFixed(2),
        sustraendo_bs !== undefined ? sustraendo_bs.toFixed(2) : null,
        statusFinal,
        observaciones ?? null,
        now,
        usuario_id,
      ]
    )
  })

  return id
}
