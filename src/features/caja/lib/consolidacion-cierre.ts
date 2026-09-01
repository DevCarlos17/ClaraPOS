// =============================================
// TIPOS
// =============================================

export interface MetodoConsolidacionConfig {
  /** PowerSync boolean 0/1. 1 = liquida directo al banco en cada venta (ya posteado). */
  deposito_directo: number
}

// =============================================
// debeExcluirseDeConsolidacionCierre
// =============================================

/**
 * Determina si un metodo de cobro debe excluirse del loop de consolidacion
 * automatica del cierre porque su INGRESO bancario ya fue posteado en el
 * momento de la venta (use-ventas.ts:1542-1611). Funcion PURA: sin I/O, sin tx.
 */
export function debeExcluirseDeConsolidacionCierre(
  config: MetodoConsolidacionConfig
): boolean {
  return config.deposito_directo === 1
}
