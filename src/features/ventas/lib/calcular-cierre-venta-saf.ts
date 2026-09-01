import Decimal from 'decimal.js'
import { usdToBs, bsToUsd, type DecimalInput } from '@/lib/currency'

/**
 * Cierre SAF-aware del checkout de una venta POS: dado el total, la tasa, lo
 * abonado en pagos nativos y el credito standing (saldo a favor) disponible
 * del cliente, calcula el saldo pendiente correcto, el `tipo` de la venta y
 * el monto de SAF efectivamente aplicado (capeado). Funcion PURA: sin I/O.
 *
 * Reproduce el calculo Bs-anclado que ya usaba `crearVenta()`
 * (`usdToBs(total, tasa) - abonadoBsNativo - usdToBs(abonadoUsdNativo, tasa)`,
 * clamp >= 0) y le inserta la resta del SAF ANTES de decidir el `tipo` y de
 * escribir cualquier registro de CxC — esto es lo que corrige el bug de
 * orden de escritura (ver openspec/changes/pos-aplicar-saf-checkout/design.md
 * Decision 1/2).
 */
export interface CalcularCierreVentaConSafInput {
  totalUsd: DecimalInput
  tasa: DecimalInput
  /** Suma de pagos[] con moneda='BS', en Bs nativos. */
  abonadoBsNativo: DecimalInput
  /** Suma de pagos[] con moneda='USD', en USD nativos. */
  abonadoUsdNativo: DecimalInput
  /** SAF solicitado por el cajero/cliente en USD (0 si no aplica SAF). */
  safSolicitadoUsd: DecimalInput
  /** Credito standing disponible del cliente en USD (derivado SUM(SAFC)-SUM(SAF)). */
  creditoDisponibleUsd: DecimalInput
  /**
   * `discrepancy?.mode === 'CREDITO'` — cuando es true, NO se auto-absorbe el
   * residuo de redondeo (<= tasa*0.01): se respeta la eleccion manual del
   * cajero de dejar el remanente a credito.
   */
  respetarEleccionCredito: boolean
}

export interface CalcularCierreVentaConSafResult {
  saldoPendUsd: Decimal
  tipo: 'CONTADO' | 'CREDITO'
  /** SAF efectivamente aplicado, ya capeado a min(solicitado, disponible, pendienteAntesDeSaf). */
  safAplicadoUsd: Decimal
  /** true si `safSolicitadoUsd` tuvo que ser reducido para llegar a `safAplicadoUsd`. */
  safFueCapeado: boolean
}

export function calcularCierreVentaConSaf(
  input: CalcularCierreVentaConSafInput
): CalcularCierreVentaConSafResult {
  const totalUsd = new Decimal(input.totalUsd)
  const tasa = new Decimal(input.tasa)
  const abonadoBsNativo = new Decimal(input.abonadoBsNativo)
  const abonadoUsdNativo = new Decimal(input.abonadoUsdNativo)
  const safSolicitadoUsd = Decimal.max(new Decimal(0), new Decimal(input.safSolicitadoUsd))
  const creditoDisponibleUsd = Decimal.max(new Decimal(0), new Decimal(input.creditoDisponibleUsd))

  // Pendiente ANTES de SAF, anclado en Bs (igual que el calculo original de crearVenta).
  const pendienteBsPreSaf = Decimal.max(
    new Decimal(0),
    usdToBs(totalUsd, tasa).minus(abonadoBsNativo).minus(usdToBs(abonadoUsdNativo, tasa))
  )
  const pendienteUsdPreSaf = bsToUsd(pendienteBsPreSaf, tasa)

  // Cap de 3 vias: nunca aplicar mas de lo solicitado, lo disponible, o lo que
  // realmente falta pagar de esta factura.
  const safAplicadoUsd = Decimal.min(safSolicitadoUsd, creditoDisponibleUsd, pendienteUsdPreSaf)
  const safFueCapeado = safSolicitadoUsd.gt(safAplicadoUsd)

  const pendienteBsPostSaf = Decimal.max(
    new Decimal(0),
    pendienteBsPreSaf.minus(usdToBs(safAplicadoUsd, tasa))
  )

  // Umbral de redondeo (igual que el original): residuo <= tasa*0.01 se
  // auto-absorbe a menos que el cajero haya elegido credito explicitamente.
  const umbral = tasa.times('0.01')
  const esAutoAbsorb = pendienteBsPostSaf.lte(umbral) && !input.respetarEleccionCredito
  const saldoPendUsd = esAutoAbsorb ? new Decimal(0) : bsToUsd(pendienteBsPostSaf, tasa)

  const tipo: 'CONTADO' | 'CREDITO' = saldoPendUsd.gt('0.001') ? 'CREDITO' : 'CONTADO'

  return { saldoPendUsd, tipo, safAplicadoUsd, safFueCapeado }
}
