import Decimal from 'decimal.js'

// =============================================
// TIPOS
// =============================================

export interface ResolverMontoConsolidacionLoteParams {
  /**
   * Monto contado/reportado por el cajero para este metodo, en moneda NATIVA
   * del metodo (misma moneda que totalSistemaD, misma que monedaId pasado a
   * consolidarMetodoATesoreriaEnTx — sin conversion de tasa). null = el
   * cajero no reporto conteo para este metodo.
   */
  totalFisicoNativo: Decimal | null
}

// =============================================
// resolverMontoConsolidacionLote
// =============================================

/**
 * Resuelve el monto a consolidar en Tesoreria para un metodo POR-LOTE
 * (deposito_directo=0) en la rama "sin lotes POS" del cierre. Funcion PURA.
 *
 * Regla (decision de negocio, obs #2567): a Tesoreria viaja SIEMPRE lo
 * reportado por el cajero, nunca totalSistemaD. Sin conteo -> 0 explicito,
 * jamas un fallback silencioso al sistema. NO recibe totalSistemaD en la
 * firma: estructuralmente imposible reintroducir el bug original.
 */
export function resolverMontoConsolidacionLote(
  params: ResolverMontoConsolidacionLoteParams
): Decimal {
  return params.totalFisicoNativo ?? new Decimal(0)
}
