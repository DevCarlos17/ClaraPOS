import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface VencimientoCobrar {
  id: string
  empresa_id: string
  venta_id: string
  cliente_id: string
  nro_cuota: number
  fecha_vencimiento: string
  monto_original_usd: string
  monto_pagado_usd: string
  saldo_pendiente_usd: string
  status: string
  created_at: string
  updated_at: string
}

// ─── Hooks de lectura (READ-ONLY) ────────────────────────────

/**
 * Retorna los vencimientos por cobrar de la empresa actual.
 * Filtra opcionalmente por cliente_id.
 * Ordenado por fecha_vencimiento ASC para visualizacion FIFO.
 */
export function useVencimientosCobrar(clienteId?: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hayCliente = clienteId !== undefined && clienteId !== ''

  const query = hayCliente
    ? `SELECT * FROM vencimientos_cobrar
       WHERE empresa_id = ? AND cliente_id = ?
       ORDER BY fecha_vencimiento ASC`
    : `SELECT * FROM vencimientos_cobrar
       WHERE empresa_id = ?
       ORDER BY fecha_vencimiento ASC`

  const params = hayCliente ? [empresaId, clienteId] : [empresaId]

  const { data, isLoading } = useQuery(query, params)

  return { vencimientos: (data ?? []) as VencimientoCobrar[], isLoading }
}

/**
 * Retorna los vencimientos pendientes que vencen dentro de los proximos N dias.
 * Util para alertas de cobro y panel de tesoreria.
 * Solo retorna vencimientos con status = 'PENDIENTE'.
 */
export function useVencimientosProximos(dias: number) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // Calcular la fecha limite (hoy + N dias) como string ISO YYYY-MM-DD
  const fechaLimite = (() => {
    const d = new Date()
    d.setDate(d.getDate() + dias)
    return d.toISOString().slice(0, 10)
  })()

  const { data, isLoading } = useQuery(
    `SELECT * FROM vencimientos_cobrar
     WHERE empresa_id = ? AND status = 'PENDIENTE'
       AND fecha_vencimiento <= ?
     ORDER BY fecha_vencimiento ASC`,
    [empresaId, fechaLimite]
  )

  return { vencimientos: (data ?? []) as VencimientoCobrar[], isLoading }
}
