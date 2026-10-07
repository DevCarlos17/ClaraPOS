import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

/**
 * Deuda real de facturas de UN cliente: SUM(ventas.saldo_pend_usd) de
 * facturas realmente pendientes, filtrado por empresa_id.
 *
 * Fuente dedicada para el GATE de limite de credito en POS (cobro-modal.tsx,
 * pos-terminal.tsx, cliente-selector.tsx) — deliberadamente NO consulta
 * `src/features/clientes/hooks/use-clientes.ts` (modulo Clientes queda fuera
 * de este change) ni `clientes.saldo_actual` (neteado). Ver
 * openspec/changes/cxc-saldo-favor-modelo/design.md Decision 3 (corregida).
 */
export function useDeudaFacturasCliente(clienteId: string | null): {
  deudaFacturasUsd: number
  isLoading: boolean
} {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const shouldQuery = !!(clienteId && empresaId)

  const { data, isLoading } = useQuery(
    shouldQuery
      ? `SELECT COALESCE(SUM(CAST(saldo_pend_usd AS REAL)), 0) as deuda_usd
         FROM ventas
         WHERE cliente_id = ? AND empresa_id = ? AND CAST(saldo_pend_usd AS REAL) > 0.001`
      : '',
    shouldQuery ? [clienteId, empresaId] : []
  )

  const row = (data ?? [])[0] as { deuda_usd: number } | undefined
  return { deudaFacturasUsd: row?.deuda_usd ?? 0, isLoading }
}

/**
 * Deuda real de facturas para un LOTE de clientes (una sola query con IN),
 * usado en listas/dropdowns donde se muestran varios clientes candidatos a
 * la vez (ej. resultados de busqueda en cliente-selector.tsx). Retorna un
 * mapa `clienteId -> deudaFacturasUsd` (ausente = 0).
 */
export function useDeudaFacturasClientes(clienteIds: string[]): Record<string, number> {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const ids = clienteIds.filter(Boolean)
  const shouldQuery = ids.length > 0 && !!empresaId
  const placeholders = ids.map(() => '?').join(',')

  const { data } = useQuery(
    shouldQuery
      ? `SELECT cliente_id, COALESCE(SUM(CAST(saldo_pend_usd AS REAL)), 0) as deuda_usd
         FROM ventas
         WHERE empresa_id = ? AND cliente_id IN (${placeholders}) AND CAST(saldo_pend_usd AS REAL) > 0.001
         GROUP BY cliente_id`
      : '',
    shouldQuery ? [empresaId, ...ids] : []
  )

  const map: Record<string, number> = {}
  for (const row of (data ?? []) as Array<{ cliente_id: string; deuda_usd: number }>) {
    map[row.cliente_id] = row.deuda_usd
  }
  return map
}

/**
 * Saldo a favor (credito standing) para un LOTE de clientes (una sola query
 * con IN), misma logica que `useSaldoAFavor` (single-client, en
 * `src/core/hooks/use-saldo-a-favor.ts`) pero en batch — usado en
 * listas/dropdowns donde se muestran varios clientes candidatos a la vez
 * (ej. resultados de busqueda en cliente-selector.tsx). `disponible` lee
 * `clientes.saf_disponible` directo (snapshot mantenido por trigger, ver
 * migrations/0102), filtrado por id IN (...) AND empresa_id (multi-tenant
 * safe). Ya NO escanea movimientos_cuenta en cada render
 * (saf-snapshot-y-trazabilidad, reemplaza el SUM(SAFC)-SUM(SAF) de
 * cxc-saldo-favor-modelo por la misma fuente confiable, ahora O(1)). Retorna
 * un mapa `clienteId -> creditoFavorUsd` (ausente = 0).
 *
 * Deliberadamente separado de `useDeudaFacturasClientes`: deuda y saldo a
 * favor son cifras independientes, nunca neteadas entre si (ver design.md
 * Decision 1/3, obs #2778).
 */
export function useCreditoFavorClientes(clienteIds: string[]): Record<string, number> {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const ids = clienteIds.filter(Boolean)
  const shouldQuery = ids.length > 0 && !!empresaId
  const placeholders = ids.map(() => '?').join(',')

  const { data } = useQuery(
    shouldQuery
      ? `SELECT id as cliente_id, CAST(saf_disponible AS REAL) as disponible
         FROM clientes
         WHERE empresa_id = ? AND id IN (${placeholders})`
      : '',
    shouldQuery ? [empresaId, ...ids] : []
  )

  const map: Record<string, number> = {}
  for (const row of (data ?? []) as Array<{ cliente_id: string; disponible: number }>) {
    map[row.cliente_id] = row.disponible
  }
  return map
}
