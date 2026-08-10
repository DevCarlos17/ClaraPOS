/**
 * Selectores puros de montos para registros `gastos`.
 *
 * Semantica canonica de columnas (tabla-wide, congelada — ver
 * openspec/changes/gastos-base-iva-costo/design.md):
 * - `base_imponible_usd` = costo real (BASE, sin IVA)
 * - `monto_iva_usd`      = impuesto (IVA), no es costo
 * - `monto_usd`          = total = base + IVA, el desembolso
 *
 * `monto_usd` NUNCA se redefine por tipo de fila (manual vs cargo de compra):
 * ambos orígenes escriben las 3 columnas con el mismo significado. Los
 * reportes deben leer `base_imponible_usd` para el costo, no `monto_usd`.
 */

export interface GastoMontos {
  base_imponible_usd: string
  monto_iva_usd: string
  monto_usd: string
}

function parseOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') return null
  const n = parseFloat(value)
  return Number.isNaN(n) ? null : n
}

/** Costo real del gasto (base imponible). Fallback defensivo a `monto_usd` si falta. */
export function montoCostoGasto(g: GastoMontos): number {
  return parseOrNull(g.base_imponible_usd) ?? parseOrNull(g.monto_usd) ?? 0
}

/** Impuesto (IVA) del gasto. Fallback defensivo a 0 si falta. */
export function montoIvaGasto(g: GastoMontos): number {
  return parseOrNull(g.monto_iva_usd) ?? 0
}

/** Total desembolsado (base + IVA). */
export function montoTotalGasto(g: GastoMontos): number {
  return parseOrNull(g.monto_usd) ?? 0
}
