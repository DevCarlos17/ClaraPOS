import Decimal from 'decimal.js'
import type { DecimalInput } from '@/lib/currency'

/**
 * Estado del monto de saldo a favor (SAF) frente a sus dos topes
 * simultaneos — reemplaza el clamp silencioso de `capSafMontoUsd`
 * (sdd/saf-snapshot-y-trazabilidad/design-b22-dual-input, #5267). El
 * llamador compone este estado con su propio gate de submit (AND
 * `estado === 'ok'`) y mapea cada valor a un mensaje distinto en espanol —
 * el helper en si no produce texto de UI, solo el codigo de estado.
 */
export type SafMontoEstado = 'ok' | 'excedeDisponible' | 'excedeTotal'

/** Safe converter — never throws. Blank/empty treats as Decimal(0), mismo criterio que `currency.ts`. */
function toD(val: DecimalInput): Decimal {
  if (val instanceof Decimal) return val
  if (typeof val === 'string' && val.trim() === '') return new Decimal(0)
  try {
    return new Decimal(val)
  } catch {
    return new Decimal(0)
  }
}

/**
 * Evalua un monto SAF (USD) contra el disponible del cliente y el total a
 * pagar — pura, sin I/O, sin epsilon interno: el llamador pre-redondea
 * `disponibleUsd` a 2dp (`new Decimal(x).toDecimalPlaces(2)`) ANTES de
 * llamar, igual que ya hace POS, para sanear el ruido de punto flotante en
 * el borde de UI (Design §Architecture Decisions, "Tolerancia/epsilon").
 *
 * Comparacion NO-estricta (`.greaterThan`, mismo criterio que
 * `excedeSaldoDisponible` en `notas-credito-refund.ts`): un monto EXACTAMENTE
 * igual al tope no excede — permite consumir el 100% del disponible o del
 * total (fix PR11, SAF-only payment).
 *
 * Precedencia cuando ambos topes se exceden a la vez: `excedeTotal` gana
 * (mirror exacto de `refund-tesoreria-form.tsx:659-661` — prioriza el
 * motivo "pendiente"/total sobre "disponible del origen").
 */
export function evaluarSafMonto(
  montoUsd: DecimalInput,
  disponibleUsd: DecimalInput,
  totalUsd: DecimalInput
): SafMontoEstado {
  const monto = toD(montoUsd)
  const disponible = toD(disponibleUsd)
  const total = toD(totalUsd)

  if (monto.greaterThan(total)) return 'excedeTotal'
  if (monto.greaterThan(disponible)) return 'excedeDisponible'
  return 'ok'
}
