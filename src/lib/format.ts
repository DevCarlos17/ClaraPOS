import { VE_TZ, VE_OFFSET } from './dates'

/**
 * Formatea cualquier string de fecha/hora ISO (con o sin offset) como DD/MM/YYYY
 * en zona horaria Venezuela. Funciona tanto con registros antiguos (UTC con Z)
 * como con registros nuevos (-04:00).
 */
export function formatDate(dateStr: string): string {
  try {
    // Bare YYYY-MM-DD strings are parsed as UTC midnight by new Date(), which in
    // Venezuela (UTC-4) falls on the previous day at 20:00. Treat them as VET noon
    // to keep the date stable regardless of when the record was synced.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(`${dateStr}T12:00:00${VE_OFFSET}`)
      : new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: VE_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(date)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    return `${get('day')}/${get('month')}/${get('year')}`
  } catch {
    return dateStr
  }
}

/**
 * Formatea cualquier string de fecha/hora ISO como DD/MM/YYYY HH:mm
 * en zona horaria Venezuela.
 */
export function formatDateTime(dateStr: string): string {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? new Date(`${dateStr}T12:00:00${VE_OFFSET}`)
      : new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: VE_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`
  } catch {
    return dateStr
  }
}

/**
 * Extrae solo la hora (HH:mm) de un string ISO en zona horaria Venezuela.
 */
export function formatHora(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: VE_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    return `${get('hour')}:${get('minute')}`
  } catch {
    return ''
  }
}

export function formatNumber(val: number | string, decimals = 2): string {
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '0'
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
