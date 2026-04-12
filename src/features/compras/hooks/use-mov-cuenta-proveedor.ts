import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// ─── Interfaces ─────────────────────────────────────────────

export interface MovCuentaProveedor {
  id: string
  empresa_id: string
  proveedor_id: string
  tipo: string
  referencia: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  observacion: string | null
  factura_compra_id: string | null
  doc_origen_id: string | null
  doc_origen_tipo: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

// ─── Hooks (solo lectura) ────────────────────────────────────

/**
 * Movimientos de cuenta de un proveedor especifico.
 * READ-ONLY: Este registro es inmutable, no se exponen funciones de escritura.
 * Retorna los ultimos 100 movimientos ordenados por fecha descendente.
 */
export function useMovCuentaProveedor(proveedorId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    proveedorId
      ? `SELECT * FROM movimientos_cuenta_proveedor
         WHERE empresa_id = ? AND proveedor_id = ?
         ORDER BY fecha DESC
         LIMIT 100`
      : '',
    proveedorId ? [empresaId, proveedorId] : []
  )

  return { movimientos: (data ?? []) as MovCuentaProveedor[], isLoading }
}
