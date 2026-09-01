import Decimal from 'decimal.js'

// =============================================
// TYPES
// =============================================

export type DecimalInput = string | number | Decimal

// =============================================
// MODULE CONFIG (write-once at startup)
// =============================================

interface CurrencyConfig {
  calc: number
  view: number
  rounding: Decimal.Rounding
}

let CFG: CurrencyConfig = {
  calc: 8,
  view: 2,
  rounding: Decimal.ROUND_HALF_UP,
}

// Safe defaults before initCurrencyConfig is called
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export function initCurrencyConfig(settings: {
  precisionCalc: number
  precisionView: number
  roundingMode: Decimal.Rounding
}): void {
  CFG = {
    calc: settings.precisionCalc,
    view: settings.precisionView,
    rounding: settings.roundingMode,
  }
  Decimal.set({ precision: CFG.calc + 20, rounding: CFG.rounding })
}

// =============================================
// INTERNAL HELPER
// =============================================

/** Safe converter — never throws. Returns Decimal(0) on empty/invalid input. */
function toD(val: DecimalInput): Decimal {
  if (val instanceof Decimal) return val
  if (typeof val === 'string' && val.trim() === '') return new Decimal(0)
  try {
    return new Decimal(val)
  } catch {
    return new Decimal(0)
  }
}

// =============================================
// CALCULATIONS — return Decimal
// =============================================

export function usdToBs(usd: DecimalInput, tasa: DecimalInput): Decimal {
  return toD(usd).times(toD(tasa))
}

export function bsToUsd(bs: DecimalInput, tasa: DecimalInput): Decimal {
  const t = toD(tasa)
  if (t.isZero()) return new Decimal(0)
  return toD(bs).dividedBy(t)
}

export function applyImpuesto(base: DecimalInput, pct: DecimalInput): Decimal {
  return toD(base).times(toD(pct)).dividedBy(100)
}

export function applyDescuento(precio: DecimalInput, pct: DecimalInput): Decimal {
  return toD(precio).times(toD(pct)).dividedBy(100)
}

// =============================================
// PRIVATE FORMATTING HELPER
// =============================================

/**
 * Adds thousands separator to a fixed-decimal string without re-parsing to float.
 * @param fixed   A string like "1234567.89" (dot as decimal separator, no sign)
 * @param thousandSep  Character to use as thousands separator
 * @param decimalSep   Character to use as decimal separator in output
 */
function addThousands(fixed: string, thousandSep: string, decimalSep: string): string {
  const dotIdx = fixed.indexOf('.')
  const intPart = dotIdx >= 0 ? fixed.slice(0, dotIdx) : fixed
  const decPart = dotIdx >= 0 ? fixed.slice(dotIdx + 1) : ''

  // Insert thousands separator from the right
  let result = ''
  for (let i = 0; i < intPart.length; i++) {
    const remaining = intPart.length - i
    if (i > 0 && remaining % 3 === 0) result += thousandSep
    result += intPart[i]
  }

  return decPart.length > 0 ? result + decimalSep + decPart : result
}

// =============================================
// DISPLAY — return formatted string
// =============================================

/** USD format: $1,234.57 (2 view decimals, commas for thousands, dot for decimal) */
export function formatUsd(val: DecimalInput): string {
  const d = toD(val)
  if (d.isNaN()) return '$0.00'
  const fixed = d.toFixed(CFG.view, CFG.rounding)
  const isNeg = fixed.startsWith('-')
  const abs = isNeg ? fixed.slice(1) : fixed
  return `${isNeg ? '-' : ''}$${addThousands(abs, ',', '.')}`
}

/** Bs format: Bs. 1.234,56 (2 view decimals, dots for thousands, comma for decimal — Venezuelan locale) */
export function formatBs(val: DecimalInput): string {
  const d = toD(val)
  if (d.isNaN()) return 'Bs. 0,00'
  const fixed = d.toFixed(CFG.view, CFG.rounding)
  const isNeg = fixed.startsWith('-')
  const abs = isNeg ? fixed.slice(1) : fixed
  return `${isNeg ? '-' : ''}Bs. ${addThousands(abs, '.', ',')}`
}

/** Tasa format: 4 decimal places with comma as decimal separator (e.g. 40,5000) */
export function formatTasa(val: DecimalInput): string {
  const d = toD(val)
  if (d.isNaN()) return '0,0000'
  return d.toFixed(4, CFG.rounding).replace('.', ',')
}

// =============================================
// STORAGE — fixed 8-decimal string for DB writes
// =============================================

/** Returns a fixed 8-decimal string for PowerSync/Supabase writes (e.g. "8024.64000000") */
export function toStorageString(val: DecimalInput): string {
  return toD(val).toFixed(CFG.calc, CFG.rounding)
}
