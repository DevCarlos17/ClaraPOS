import Decimal from 'decimal.js'
import type { DecimalInput } from '@/lib/currency'

/**
 * Redondea y capea a 2 decimales un monto de saldo a favor (SAF) contra un
 * tope disponible, usando Decimal en cada paso. Funcion PURA: sin I/O.
 *
 * QA fix (pos-aplicar-saf-checkout): el checkbox "Aplicar saldo a favor"
 * mostraba `1.29999999` en vez de `1.30` porque el valor pre-cargado se
 * convertia a `number` via `.toNumber()` sin redondear primero, y el
 * `disponible` que llega desde `useSaldoAFavor` puede arrastrar ruido de
 * punto flotante (SUM() de SQLite via `CAST(monto AS REAL)`). Redondear con
 * `toDecimalPlaces(2)` ANTES de `.toNumber()` elimina el ruido en el limite
 * de UI, respetando la regla de negocio #10 (campos financieros = Decimal,
 * nunca float).
 */
export function clampearSafMonto(valor: DecimalInput, tope: DecimalInput): number {
  return Decimal.min(new Decimal(valor), new Decimal(tope)).toDecimalPlaces(2).toNumber()
}
