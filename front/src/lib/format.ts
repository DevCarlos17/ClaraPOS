import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function formatDate(dateStr: string): string {
  try {
    const date = parseISO(dateStr)
    return format(date, 'dd/MM/yyyy', { locale: es })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string): string {
  try {
    const date = parseISO(dateStr)
    return format(date, 'dd/MM/yyyy HH:mm', { locale: es })
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
