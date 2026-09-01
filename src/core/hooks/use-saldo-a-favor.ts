import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { calcularCreditoDisponible } from '@/features/cxc/lib/deuda-credito-cliente'

export interface SaldoAFavor {
  /** Available SAF credit in USD (always >= 0). */
  disponible: number
  /** True when disponible > 0. */
  tieneSaf: boolean
}

/**
 * Returns the available SAF (saldo a favor / standing credit) for a client.
 * `disponible = MAX(0, SUM(SAFC) - SUM(SAF))` en `movimientos_cuenta`,
 * filtrado por clienteId AND empresa_id (multi-tenant safe).
 *
 * Deliberadamente NO deriva de `clientes.saldo_actual` — ese campo mezcla
 * deuda y credito (neteado) y puede leer casi-cero con credito real
 * disponible. Ver openspec/changes/cxc-saldo-favor-modelo/design.md
 * Decision 1. Este hook es para el CREDITO PENDIENTE DE APLICAR (usado por
 * cobro-modal.tsx, pago-factura-modal.tsx, abono-global-modal.tsx) — NO debe
 * confundirse con el gate de LIMITE DE CREDITO (calcularDisponibleCredito),
 * que nunca suma este valor.
 */
export function useSaldoAFavor(clienteId: string | null): SaldoAFavor {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const shouldQuery = !!(clienteId && empresaId)

  const { data } = useQuery(
    shouldQuery
      ? `SELECT
           COALESCE(SUM(CASE WHEN tipo = 'SAFC' THEN CAST(monto AS REAL) ELSE 0 END), 0) as creado,
           COALESCE(SUM(CASE WHEN tipo = 'SAF' THEN CAST(monto AS REAL) ELSE 0 END), 0) as consumido
         FROM movimientos_cuenta WHERE cliente_id = ? AND empresa_id = ?`
      : '',
    shouldQuery ? [clienteId, empresaId] : []
  )

  const row = (data ?? [])[0] as { creado: number; consumido: number } | undefined
  const disponible = calcularCreditoDisponible(row?.creado ?? 0, row?.consumido ?? 0).toNumber()
  const tieneSaf = disponible > 0

  return { disponible, tieneSaf }
}
