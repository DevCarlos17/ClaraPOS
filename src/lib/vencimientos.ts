import { VE_TZ } from './dates'

/** Extrae anio/mes/dia de una fecha en zona horaria Venezuela */
function vePartsOf(date: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: VE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
}

/**
 * Calcula la diferencia en dias calendario (VET) entre una fecha de
 * vencimiento (string "YYYY-MM-DD") y "ahora".
 *
 * Usa el constructor numerico `new Date(y, m-1, d)` (siempre local, sin
 * reparseo UTC-medianoche) tanto para la fecha de vencimiento como para
 * "hoy" en Venezuela, evitando el bug de corte 20:00 VET descrito en
 * src/lib/dates.ts. NUNCA usar `new Date(fechaStr)` con un string
 * "YYYY-MM-DD": eso se interpreta como UTC medianoche.
 *
 * Convencion de signo: 0 = vence hoy, negativo = vencido (dias de atraso),
 * positivo = dias restantes.
 */
export function diasHastaVencimiento(fechaVencimientoStr: string, ahora: Date = new Date()): number {
  const [vy, vm, vd] = fechaVencimientoStr.split('-').map(Number)
  const vencimiento = new Date(vy, vm - 1, vd)

  const hoyParts = vePartsOf(ahora)
  const hoy = new Date(hoyParts.year, hoyParts.month - 1, hoyParts.day)

  return Math.round((vencimiento.getTime() - hoy.getTime()) / 86400000)
}
