import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export interface SaldoAFavor {
  /** Available SAF credit in USD (always >= 0). */
  disponible: number
  /** True when disponible > 0 (i.e. saldo_actual < -0.001). */
  tieneSaf: boolean
}

/**
 * Returns the available SAF (saldo a favor) credit for a client.
 * Queries `clientes` filtered by clienteId AND empresa_id (multi-tenant safe).
 *
 * Gate: saldo_actual < -0.001 → client has credit.
 * disponible = Math.abs(saldo_actual) when credit exists, otherwise 0.
 */
export function useSaldoAFavor(clienteId: string | null): SaldoAFavor {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const shouldQuery = !!(clienteId && empresaId)

  const { data } = useQuery(
    shouldQuery
      ? 'SELECT saldo_actual FROM clientes WHERE id = ? AND empresa_id = ? LIMIT 1'
      : '',
    shouldQuery ? [clienteId, empresaId] : []
  )

  const row = (data ?? [])[0] as { saldo_actual: string } | undefined
  const saldoActual = row ? parseFloat(row.saldo_actual) : 0
  const disponible = saldoActual < -0.001 ? Math.abs(saldoActual) : 0
  const tieneSaf = disponible > 0

  return { disponible, tieneSaf }
}
