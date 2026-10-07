import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export interface SaldoAFavor {
  /** Available SAF credit in USD (always >= 0). */
  disponible: number
  /** True when disponible > 0. */
  tieneSaf: boolean
}

/**
 * Returns the available SAF (saldo a favor / standing credit) for a client.
 * `disponible` lee `clientes.saf_disponible` directo (snapshot mantenido por
 * trigger, ver migrations/0102), filtrado por clienteId AND empresa_id
 * (multi-tenant safe). Ya NO escanea movimientos_cuenta en cada render
 * (saf-snapshot-y-trazabilidad, reemplaza el SUM(SAFC)-SUM(SAF) de
 * cxc-saldo-favor-modelo Decision 1 por la misma fuente confiable, ahora
 * O(1) — el trigger ya aplica MAX(0,...) al escribir).
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
      ? 'SELECT CAST(saf_disponible AS REAL) as disponible FROM clientes WHERE id = ? AND empresa_id = ?'
      : '',
    shouldQuery ? [clienteId, empresaId] : []
  )

  const row = (data ?? [])[0] as { disponible: number } | undefined
  const disponible = row?.disponible ?? 0
  const tieneSaf = disponible > 0

  return { disponible, tieneSaf }
}
