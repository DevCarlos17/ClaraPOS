import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'

/**
 * Deuda real de facturas de UN cliente: lee `clientes.saldo_pendiente_usd`
 * directo (snapshot O(1) mantenido por trigger, ver migrations/0110). Ya NO
 * agrega SUM(ventas.saldo_pend_usd) en cada render (cxc-ledger-saldos-
 * redesign, slice 1c — ver design.md "Read-path parity proof": el trigger
 * mantiene esta columna matematicamente identica a
 * SUM(ventas.saldo_pend_usd WHERE estado != 'pago') en todo momento,
 * tolerancia 0, migrations/0108). Requiere que el backfill 0111 haya
 * corrido en la DB destino, o se mostrara 0 para deuda preexistente.
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
      ? `SELECT CAST(saldo_pendiente_usd AS REAL) as deuda_usd
         FROM clientes
         WHERE id = ? AND empresa_id = ?`
      : '',
    shouldQuery ? [clienteId, empresaId] : []
  )

  const row = (data ?? [])[0] as { deuda_usd: number } | undefined
  return { deudaFacturasUsd: row?.deuda_usd ?? 0, isLoading }
}

/**
 * Deuda real de facturas para un LOTE de clientes (una sola query con IN),
 * usado en listas/dropdowns donde se muestran varios clientes candidatos a
 * la vez (ej. resultados de busqueda en cliente-selector.tsx). Lee
 * `clientes.saldo_pendiente_usd` directo (mismo swap O(1) que la version
 * singular, ver JSDoc de `useDeudaFacturasCliente` arriba — slice 1c de
 * cxc-ledger-saldos-redesign). Retorna un mapa `clienteId -> deudaFacturasUsd`
 * (ausente = 0).
 */
export function useDeudaFacturasClientes(clienteIds: string[]): Record<string, number> {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const ids = clienteIds.filter(Boolean)
  const shouldQuery = ids.length > 0 && !!empresaId
  const placeholders = ids.map(() => '?').join(',')

  const { data } = useQuery(
    shouldQuery
      ? `SELECT id as cliente_id, CAST(saldo_pendiente_usd AS REAL) as deuda_usd
         FROM clientes
         WHERE empresa_id = ? AND id IN (${placeholders})`
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
