import Decimal from 'decimal.js'
import { bsToUsd, usdToBs, type DecimalInput } from '@/lib/currency'

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

/**
 * Tope de saldo disponible POR MONEDA (nc-admin-saldo-disponible-sesion,
 * Design §Interfaces): `true` si `montoNativo` excede `saldoDisponible`,
 * comparando SIEMPRE en la MISMA moneda (nunca number vs number, siempre
 * via Decimal para preservar precision hasta 8 decimales, Regla de Oro
 * CLAUDE.md #10). Tope NO-estricto: monto === saldo disponible no excede
 * (permite usar el 100% del saldo).
 */
export function excedeSaldoDisponible(montoNativo: DecimalInput, saldoDisponible: DecimalInput): boolean {
  return new Decimal(montoNativo).greaterThan(new Decimal(saldoDisponible))
}

/**
 * Pendiente restante de la NC (en USD) disponible para UNA linea especifica
 * (Ajuste UX post-QA #3, Opcion A): el tope total de la NC menos lo que YA
 * consumen las OTRAS lineas del formulario — nunca negativo (floor en 0,
 * mismo criterio que `calcularRemanenteRefund`). Sin esto, el tope de tipeo
 * de una linea no puede recalcularse en vivo cuando el usuario agrega/edita
 * otras lineas del mismo formulario.
 */
export function pendienteRestanteLineaUsd(
  montoDisponibleUsd: DecimalInput,
  sumaUsdOtrasLineas: DecimalInput
): Decimal {
  return Decimal.max(new Decimal(0), new Decimal(montoDisponibleUsd).minus(new Decimal(sumaUsdOtrasLineas)))
}

/**
 * Convierte un tope expresado en USD (pendiente de la NC) a la moneda
 * NATIVA de una linea — inverso de `nativoAUsd`, misma regla de oro: usa
 * SIEMPRE `tasa_historica`, nunca la tasa vigente del sistema (Ajuste UX
 * post-QA #3, Opcion A).
 */
export function usdACapNativo(capUsd: DecimalInput, esNativaBs: boolean, tasaHistorica: DecimalInput): Decimal {
  return esNativaBs ? usdToBs(capUsd, tasaHistorica) : new Decimal(capUsd)
}

/**
 * Tope efectivo de una linea = MINIMO entre el pendiente restante de la NC
 * (ya convertido a la moneda nativa de la linea) y el saldo disponible del
 * origen elegido — banco/caja fuerte de Tesoreria, o efectivo de la sesion
 * (Ajuste UX post-QA #3, Opcion A). `disponibleNativo` es `null` cuando el
 * origen todavia no resuelve un saldo conocido (ej. Origen=Tesoreria sin
 * Cuenta elegida aun, o saldo de sesion en `isLoading`) — en ese caso el
 * tope es SOLO el pendiente, sin bloquear el tipeo por un origen que ni
 * siquiera se eligio.
 */
export function capMontoLinea(pendienteNativo: DecimalInput, disponibleNativo: DecimalInput | null): Decimal {
  const pendienteD = new Decimal(pendienteNativo)
  if (disponibleNativo === null) return pendienteD
  return Decimal.min(pendienteD, new Decimal(disponibleNativo))
}

/**
 * Determina si un nuevo valor de input debe ACEPTARSE dado un tope
 * (Ajuste UX post-QA #3, Opcion A confirmada por el usuario): rechaza la
 * edicion que dejaria el campo por ENCIMA del tope, pero SIEMPRE permite
 * estados intermedios de edicion (campo vacio, o un string que decimal.js
 * todavia no puede parsear como numero completo, ej. "12." o ".") para no
 * atrapar al usuario ni romper la escritura de decimales con punto inicial
 * (Regla dura de UX: nunca bloquear borrar/editar en el medio del valor).
 */
export function permiteIngresoMonto(valorIngresado: string, capNativo: DecimalInput): boolean {
  if (valorIngresado.trim() === '') return true
  let valorD: Decimal
  try {
    valorD = new Decimal(valorIngresado)
  } catch {
    return true
  }
  if (valorD.isNaN()) return true
  return !excedeSaldoDisponible(valorD, capNativo)
}
