import Decimal from 'decimal.js'

/**
 * Valor de entrada aceptado por las funciones de mascara: el string crudo
 * que viene de un input controlado, o el numero completo guardado en un
 * `useRef` de precision completa.
 */
export type MaskInput = string | number

/**
 * Vacio/blanco significa "sin valor" y debe mostrarse como cadena vacia,
 * nunca como "0.00" — un cero real (tipeado por el usuario) SI debe
 * mostrarse como cero formateado. Ver spec: "Empty stays empty".
 */
function isBlank(value: MaskInput): boolean {
  if (typeof value === 'string') return value.trim() === ''
  return Number.isNaN(value)
}

/** Convierte a Decimal de forma segura; retorna null si el valor no es parseable. */
function toDecimalOrNull(value: MaskInput): Decimal | null {
  try {
    const d = new Decimal(value)
    return d.isNaN() ? null : d
  } catch {
    return null
  }
}

/**
 * Mascara de display por defecto (2 decimales, `precision_view`).
 *
 * Usada en `onBlur`/render normal de los inputs de precio/costo/margen: nunca
 * usa `parseFloat`, siempre decimal.js, para evitar artefactos de punto
 * flotante (ej. `1.005` nativo redondea mal a "1.00").
 */
export function toMaskedDisplay(value: MaskInput, viewDecimals = 2): string {
  if (isBlank(value)) return ''
  const d = toDecimalOrNull(value)
  return d === null ? '' : d.toFixed(viewDecimals)
}

/**
 * Quita ceros de relleno (padding) de un string de decimal.js con punto
 * decimal, sin usar parseFloat/Number en ningun momento (evita reintroducir
 * error de punto flotante). Solo opera sobre texto: si el string no tiene
 * punto decimal, se retorna tal cual (ya es un entero limpio).
 */
function stripTrailingZeros(fixed: string): string {
  if (!fixed.includes('.')) return fixed
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '' ? '0' : trimmed
}

/**
 * Revela el valor con precision completa (hasta 8 decimales, `precision_calc`),
 * recortando ceros de relleno para que solo se muestren digitos con
 * precision real (ej. `8.5` en vez de `8.50000000`, `8` en vez de
 * `8.00000000`). Un digito final que SI es precision real (ej. `8.50000001`)
 * nunca se recorta porque no es un cero.
 *
 * Usada en `onFocus`: el usuario ve/edita el valor real almacenado, no la
 * version truncada a 2 decimales.
 */
export function toFullDisplay(value: MaskInput, calcDecimals = 8): string {
  if (isBlank(value)) return ''
  const d = toDecimalOrNull(value)
  return d === null ? '' : stripTrailingZeros(d.toFixed(calcDecimals))
}
