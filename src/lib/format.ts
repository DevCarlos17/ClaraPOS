import { VE_TZ } from './dates'

/**
 * Formatea cualquier string de fecha/hora ISO (con o sin offset) como DD/MM/YYYY
 * en zona horaria Venezuela. Funciona tanto con registros antiguos (UTC con Z)
 * como con registros nuevos (-04:00).
 */
export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
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
    const date = new Date(dateStr)
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

export function formatNumber(val: number | string, decimals = 2): string {
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '0'
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
