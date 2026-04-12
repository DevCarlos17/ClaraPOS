import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

// ─── Interfaces ─────────────────────────────────────────────

export interface RetencionIvaVenta {
  id: string
  empresa_id: string
  venta_id: string
  cliente_id: string
  nro_comprobante: string
  fecha_comprobante: string
  periodo_fiscal: string | null
  base_imponible: string
  porcentaje_iva: string
  monto_iva: string
  porcentaje_retencion: string
  monto_retenido: string
  status: string
  observaciones: string | null
  created_at: string
  created_by: string | null
}

export interface CrearRetencionIvaVentaParams {
  venta_id: string
  cliente_id: string
  nro_comprobante: string
  fecha_comprobante: string
  periodo_fiscal?: string
  base_imponible: number
  porcentaje_iva: number
  monto_iva: number
  porcentaje_retencion: number
  monto_retenido: number
  observaciones?: string
  empresa_id: string
  usuario_id: string
}

// ─── Hook de lectura ─────────────────────────────────────────

/**
 * Retorna las retenciones de IVA sobre ventas de la empresa actual.
 * Filtra opcionalmente por rango de fechas (fecha_comprobante).
 */
export function useRetencionesIvaVentas(fechaDesde?: string, fechaHasta?: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hayFiltroFechas = fechaDesde !== undefined || fechaHasta !== undefined

  const query = (() => {
    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return `SELECT * FROM retenciones_iva_ventas
              WHERE empresa_id = ?
                AND fecha_comprobante >= ? AND fecha_comprobante <= ?
              ORDER BY fecha_comprobante DESC`
    }

    if (hayFiltroFechas && fechaDesde) {
      return `SELECT * FROM retenciones_iva_ventas
              WHERE empresa_id = ? AND fecha_comprobante >= ?
              ORDER BY fecha_comprobante DESC`
    }

    if (hayFiltroFechas && fechaHasta) {
      return `SELECT * FROM retenciones_iva_ventas
              WHERE empresa_id = ? AND fecha_comprobante <= ?
              ORDER BY fecha_comprobante DESC`
    }

    return `SELECT * FROM retenciones_iva_ventas
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

  return { retenciones: (data ?? []) as RetencionIvaVenta[], isLoading }
}

// ─── Funcion: crearRetencionIvaVenta ─────────────────────────

/**
 * Registra una retencion de IVA sobre una venta.
 * El status inicial es 'REGISTRADA'.
 */
export async function crearRetencionIvaVenta(
  params: CrearRetencionIvaVentaParams
): Promise<string> {
  const {
    venta_id,
    cliente_id,
    nro_comprobante,
    fecha_comprobante,
    periodo_fiscal,
    base_imponible,
    porcentaje_iva,
    monto_iva,
    porcentaje_retencion,
    monto_retenido,
    observaciones,
    empresa_id,
    usuario_id,
  } = params

  if (base_imponible <= 0) throw new Error('La base imponible debe ser mayor a 0')
  if (monto_iva <= 0) throw new Error('El monto de IVA debe ser mayor a 0')
  if (monto_retenido <= 0) throw new Error('El monto retenido debe ser mayor a 0')

  const id = uuidv4()
  const now = new Date().toISOString()

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO retenciones_iva_ventas (
         id, empresa_id, venta_id, cliente_id, nro_comprobante, fecha_comprobante,
         periodo_fiscal, base_imponible, porcentaje_iva, monto_iva,
         porcentaje_retencion, monto_retenido, status, observaciones,
         created_at, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADA', ?, ?, ?)`,
      [
        id,
        empresa_id,
        venta_id,
        cliente_id,
        nro_comprobante,
        fecha_comprobante,
        periodo_fiscal ?? null,
        base_imponible.toFixed(2),
        porcentaje_iva.toFixed(2),
        monto_iva.toFixed(2),
        porcentaje_retencion.toFixed(2),
        monto_retenido.toFixed(2),
        observaciones ?? null,
        now,
        usuario_id,
      ]
    )
  })

  return id
}
