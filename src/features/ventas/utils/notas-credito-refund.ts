import Decimal from 'decimal.js'
import { bsToUsd, type DecimalInput } from '@/lib/currency'

/**
 * Modulo PURO (sin I/O, sin DB, sin React) para la modalidad
 * `REFUND_TESORERIA` de Notas de Credito (nc-refund-tesoreria, Design §e).
 * Hermano de `notas-credito-fiscal.ts` — mismo criterio: cero dependencias
 * de infraestructura, TDD estricto, reusable identico en la UI (calculo en
 * vivo del mini-formulario) y en el write core (revalidacion server-side,
 * defensa en profundidad, mismo patron que `validarTopeDobleCredito`).
 */

/**
 * Convierte el monto NATIVO de una cuenta de tesoreria (banco o caja fuerte)
 * a USD, usando SIEMPRE `notas_credito.tasa_historica` — nunca la tasa de
 * cambio vigente del sistema (Spec "Conversion a tasa historica de la NC").
 * Espejo de `_esBancoBS`/`_montoNativo` en `use-cxc.ts` (aplicarPagoFacturaEnTx).
 *
 * `esCuentaBs=true` -> la cuenta esta en Bolivares, se convierte via
 * `bsToUsd`. `esCuentaBs=false` -> la cuenta ya esta en USD, pass-through
 * (Scenario "Cuenta en USD").
 */
export function nativoAUsd(
  montoNativo: DecimalInput,
  esCuentaBs: boolean,
  tasaHistorica: DecimalInput
): Decimal {
  return esCuentaBs ? bsToUsd(montoNativo, tasaHistorica) : new Decimal(montoNativo)
}

export interface RemanenteRefundResult {
  /** Suma de todas las lineas de egreso, ya convertidas a USD. */
  sumaUsd: Decimal
  /** Remanente que NO se reembolsa por tesoreria y pasa a SAFC (Spec "Remanente no reembolsado pasa a SAFC"). Nunca negativo. */
  remanenteSafc: Decimal
  /** true si `sumaUsd` excede `remanenteALiquidar` (tolerancia 0.01, mismo patron que el resto del archivo). Cuando es true, la NC entera debe rechazarse ANTES de escribir cualquier linea (Spec "Tope"). */
  excedeTope: boolean
}

const TOLERANCIA = '0.01'

/**
 * Calcula el reparto entre las lineas de egreso de tesoreria (ya en USD) y
 * el remanente que queda a SAFC. El guard de tope (`excedeTope`) se evalua
 * ANTES de que el llamador escriba cualquier registro — full rollback si
 * excede (Design §d "Flujo numerico").
 */
export function calcularRemanenteRefund(
  remanenteALiquidar: DecimalInput,
  lineasEnUsd: Decimal[]
): RemanenteRefundResult {
  const remanente = new Decimal(remanenteALiquidar)
  const sumaUsd = lineasEnUsd.reduce((acc, linea) => acc.plus(linea), new Decimal(0))

  const excedeTope = sumaUsd.minus(remanente).greaterThan(TOLERANCIA)
  const remanenteSafc = excedeTope ? new Decimal(0) : Decimal.max(new Decimal(0), remanente.minus(sumaUsd))

  return { sumaUsd, remanenteSafc, excedeTope }
}
