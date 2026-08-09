/**
 * Conversion pura de un valor RAW de input (tal como lo tipeo el usuario, en
 * la moneda ACTUALMENTE seleccionada del formulario) hacia la representacion
 * equivalente en una moneda NUEVA, usando la tasa de la factura.
 *
 * Precision-safe: usa Decimal.js y NO redondea con toFixed antes de convertir
 * (evita el drift de ida-vuelta que produciria redondear el valor display
 * antes de reconvertirlo). Mismo criterio que la conversion de
 * `nuevo_costo_raw` (lineas de producto) en `handleMonedaSwitch` de
 * `compra-form.tsx` — extraido aqui para reutilizarlo tambien en las lineas
 * de cargo (Material de Empaque / Flete), que antes NO se reconvertian al
 * cambiar de moneda.
 */
import Decimal from 'decimal.js'

/**
 * @param rawValue Valor tal como esta en el input (string), en la moneda ACTUAL.
 *   Strings vacios o no numericos se devuelven sin cambios.
 * @param newMoneda Moneda destino.
 * @param tasa Tasa de cambio de la factura (Bs por USD). Si es <= 0 no hay
 *   forma de convertir de forma segura, se devuelve el valor sin cambios.
 */
export function convertirMontoRawEntreMonedas(
  rawValue: string,
  newMoneda: 'USD' | 'BS',
  tasa: number
): string {
  if (rawValue.trim() === '') return rawValue
  if (tasa <= 0) return rawValue

  const num = parseFloat(rawValue)
  if (isNaN(num)) return rawValue

  const dRaw = new Decimal(num)
  const converted = newMoneda === 'BS'
    ? dRaw.times(tasa).toNumber()
    : dRaw.dividedBy(tasa).toNumber()

  return String(converted)
}
