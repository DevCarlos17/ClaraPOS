import Decimal from 'decimal.js'
import type { DecimalInput } from '@/lib/currency'

/**
 * Capea un monto de saldo a favor (SAF) contra DOS topes simultaneos — el
 * disponible del cliente y el total de la factura — SIN redondear a 2
 * decimales USD. Funcion PURA: sin I/O.
 *
 * Fix pos-saf-input-bs: `clampearSafMonto` siempre aplica `.toDecimalPlaces(2)`
 * al monto USD final. Ese redondeo prematuro rompe la cobertura exacta
 * cuando el monto se deriva de un input en Bs (ej. Bs 754 a tasa 500 =
 * exactamente 1.508 USD, no 1.51): el residuo de redondeo (hasta $0.005) se
 * traduce a varios bolivares de "excedente fantasma" a tasas altas, lo que
 * dispara sin necesidad el flujo de resolucion de excedente en
 * `cobro-modal.tsx`. Esta funcion retorna el monto capeado a precision
 * Decimal completa — quien la llama decide si/como redondear para display.
 *
 * Regla de negocio (engram pos/saldo-favor-cobro-modelo): el SAF consumido
 * nunca puede superar ni el total de la factura ni el disponible del
 * cliente — previene excedente-desde-SAF.
 */
export function capSafMontoUsd(
  valorUsd: DecimalInput,
  disponibleUsd: DecimalInput,
  totalUsd: DecimalInput,
): Decimal {
  const capped = Decimal.min(new Decimal(valorUsd), new Decimal(disponibleUsd), new Decimal(totalUsd))
  return Decimal.max(new Decimal(0), capped)
}
