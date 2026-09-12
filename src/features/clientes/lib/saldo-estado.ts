import Decimal from 'decimal.js'

export type SaldoEstado = 'deuda' | 'favor' | 'neutral'

/**
 * Tres estados segun el signo de saldo_actual: 'deuda' (rojo, saldo > 0 — el
 * cliente debe dinero), 'favor' (verde, saldo < 0 — saldo a favor del
 * cliente), 'neutral' (gris, saldo exactamente 0). Usa comparedTo(0), NO
 * isPositive() — Decimal('0').isPositive() retorna true, lo que hacia que un
 * saldo de $0.00 se mostrara en rojo (deuda) en vez de neutral.
 *
 * Fuente unica de verdad compartida entre `cliente-detalle.tsx` (panel) y
 * `cliente-list.tsx` (fila de tabla) — ver openspec/changes/cxc-gestion-clientes-saldo.
 */
export function saldoEstado(saldoStr: string): SaldoEstado {
  const cmp = new Decimal(saldoStr).comparedTo(0)
  if (cmp > 0) return 'deuda'
  if (cmp < 0) return 'favor'
  return 'neutral'
}

export const SALDO_TEXT_CLASS: Record<SaldoEstado, string> = {
  deuda: 'text-red-600',
  favor: 'text-green-600',
  neutral: 'text-muted-foreground',
}
