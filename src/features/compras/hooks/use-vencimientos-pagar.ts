import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface VencimientoPagar {
  id: string
  empresa_id: string
  factura_compra_id: string
  proveedor_id: string
  nro_cuota: number
  fecha_vencimiento: string
  monto_original_usd: string
  monto_pagado_usd: string
  saldo_pendiente_usd: string
  status: string
  created_at: string
  updated_at: string
}

// ─── Hooks (solo lectura) ────────────────────────────────────

/**
 * Vencimientos por pagar.
 * READ-ONLY: Este registro solo se actualiza via operaciones del sistema.
 * Opcionalmente filtra por proveedor_id.
 */
export function useVencimientosPagar(proveedorId?: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hasProveedorFilter = Boolean(proveedorId)

  const params = hasProveedorFilter ? [empresaId, proveedorId!] : [empresaId]

  const { data, isLoading } = useQuery(
    hasProveedorFilter
      ? `SELECT vp.*, p.razon_social as proveedor_nombre
         FROM vencimientos_pagar vp
         LEFT JOIN proveedores p ON vp.proveedor_id = p.id
         WHERE vp.empresa_id = ? AND vp.proveedor_id = ?
         ORDER BY vp.fecha_vencimiento ASC`
      : `SELECT vp.*, p.razon_social as proveedor_nombre
         FROM vencimientos_pagar vp
         LEFT JOIN proveedores p ON vp.proveedor_id = p.id
         WHERE vp.empresa_id = ?
         ORDER BY vp.fecha_vencimiento ASC`,
    params
  )

  return {
    vencimientos: (data ?? []) as (VencimientoPagar & { proveedor_nombre: string })[],
    isLoading,
  }
}

/**
 * Vencimientos proximos a vencer dentro de los proximos N dias.
 * Utiliza DATE('now') de SQLite para calcular el rango.
 */
export function useVencimientosProximosPagar(dias: number) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT vp.*, p.razon_social as proveedor_nombre
     FROM vencimientos_pagar vp
     LEFT JOIN proveedores p ON vp.proveedor_id = p.id
     WHERE vp.empresa_id = ?
       AND vp.status = 'PENDIENTE'
       AND DATE(vp.fecha_vencimiento) <= DATE('now', ? || ' days')
     ORDER BY vp.fecha_vencimiento ASC`,
    [empresaId, String(dias)]
  )

  return {
    vencimientos: (data ?? []) as (VencimientoPagar & { proveedor_nombre: string })[],
    isLoading,
  }
}
