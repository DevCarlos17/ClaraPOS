import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

// ─── Interfaces ─────────────────────────────────────────────

export interface RetencionIslr {
  id: string
  empresa_id: string
  factura_compra_id: string
  proveedor_id: string
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

// ─── Helpers ────────────────────────────────────────────────

function buildDateRange(
  fechaDesde: string,
  fechaHasta: string
): { start: string; end: string } {
  return {
    start: `${fechaDesde}T00:00:00.000Z`,
    end: `${fechaHasta}T23:59:59.999Z`,
  }
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Retenciones de ISLR en compras.
 * Filtra por rango de fechas cuando ambos parametros estan presentes.
 */
export function useRetencionesIslrCompras(fechaDesde?: string, fechaHasta?: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hasDateFilter = Boolean(fechaDesde && fechaHasta)

  const params = hasDateFilter
    ? (() => {
        const { start, end } = buildDateRange(fechaDesde!, fechaHasta!)
        return [empresaId, start, end]
      })()
    : [empresaId]

  const { data, isLoading } = useQuery(
    hasDateFilter
      ? `SELECT r.*, p.razon_social as proveedor_nombre
         FROM retenciones_islr r
         LEFT JOIN proveedores p ON r.proveedor_id = p.id
         WHERE r.empresa_id = ?
           AND r.fecha_comprobante >= ?
           AND r.fecha_comprobante <= ?
         ORDER BY r.fecha_comprobante DESC`
      : `SELECT r.*, p.razon_social as proveedor_nombre
         FROM retenciones_islr r
         LEFT JOIN proveedores p ON r.proveedor_id = p.id
         WHERE r.empresa_id = ?
         ORDER BY r.fecha_comprobante DESC`,
    params
  )

  return {
    retenciones: (data ?? []) as (RetencionIslr & { proveedor_nombre: string })[],
    isLoading,
  }
}

// ─── Funciones de escritura ──────────────────────────────────

export async function crearRetencionIslr(data: {
  factura_compra_id: string
  proveedor_id: string
  concepto_islr_id?: string
  nro_comprobante: string
  fecha_comprobante: string
  periodo_fiscal?: string
  base_imponible_bs: number
  porcentaje_retencion: number
  monto_retenido_bs: number
  sustraendo_bs?: number
  observaciones?: string
  empresa_id: string
  created_by?: string
}): Promise<string> {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('retenciones_islr')
    .values({
      id,
      empresa_id: data.empresa_id,
      factura_compra_id: data.factura_compra_id,
      proveedor_id: data.proveedor_id,
      concepto_islr_id: data.concepto_islr_id ?? null,
      nro_comprobante: data.nro_comprobante.toUpperCase(),
      fecha_comprobante: data.fecha_comprobante,
      periodo_fiscal: data.periodo_fiscal ?? null,
      base_imponible_bs: data.base_imponible_bs.toFixed(2),
      porcentaje_retencion: data.porcentaje_retencion.toFixed(2),
      monto_retenido_bs: data.monto_retenido_bs.toFixed(2),
      sustraendo_bs: data.sustraendo_bs != null ? data.sustraendo_bs.toFixed(2) : null,
      status: 'REGISTRADA',
      observaciones: data.observaciones ?? null,
      created_at: now,
      created_by: data.created_by ?? null,
    })
    .execute()

  return id
}
