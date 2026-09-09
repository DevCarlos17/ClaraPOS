import Decimal from 'decimal.js'
import { bsToUsd, type DecimalInput } from '@/lib/currency'

export interface PendienteVenta {
  /** Pendiente en Bs sin capear — negativo si es overpago (vuelto). */
  pendienteBs4: Decimal
  /** Pendiente en Bs capeado a 0 (nunca negativo). Fuente unica para la fila "Pendiente". */
  pendienteBs: Decimal
  /** Pendiente en USD derivado de `pendienteBs` via `bsToUsd`, sin redondeo intermedio. */
  pendienteUsd: Decimal
}

/**
 * Fix pos-cobro-pendiente-exacto: calcula el saldo pendiente de una venta con
 * Decimal en cada paso, sin redondear a 2 decimales antes de convertir entre
 * monedas. Funcion PURA: sin I/O. Mirrors el calculo inline que ya vivia en
 * `cobro-modal.tsx` (pendienteBs4 / pendienteUsd) para que `venta-exitosa-modal.tsx`
 * deje de re-derivar el saldo via `Number(...).toFixed(2)` (regla de negocio #10:
 * redondear SOLO al final de la cadena, con Decimal, nunca con float).
 */
export function calcularPendienteVenta(
  totalEfectivoBs: DecimalInput,
  igtfBs: DecimalInput,
  totalPagadoBs: DecimalInput,
  tasa: DecimalInput,
): PendienteVenta {
  const pendienteBs4 = new Decimal(totalEfectivoBs).plus(igtfBs).minus(totalPagadoBs)
  const pendienteBs = Decimal.max(new Decimal(0), pendienteBs4)
  const pendienteUsd = bsToUsd(pendienteBs, tasa)
  return { pendienteBs4, pendienteBs, pendienteUsd }
}
