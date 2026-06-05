/**
 * Zona horaria de Venezuela: VET = UTC-4 (desde mayo 2016).
 * Todas las fechas/horas de transacciones se registran en hora venezolana.
 *
 * REGLA DE ORO:
 *  - Para escribir en la DB:  usar localNow()
 *  - Para filtrar por fecha:  usar todayStr(), daysAgo(), startOfMonth()
 *  - Para mostrar al usuario: usar formatDate() / formatDateTime() de @/lib/format
 */

export const VE_TZ = 'America/Caracas'
export const VE_OFFSET = '-04:00'

/** Extrae las partes de fecha/hora en Venezuela usando Intl (sin dependencias extra) */
function veTimeParts(date: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: VE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
}

/**
 * Retorna la fecha/hora actual en Venezuela como ISO 8601 con offset explícito.
 * Ejemplo: "2026-05-31T21:30:45.123-04:00"
 *
 * Usar para TODOS los campos de fecha en transacciones (fecha, created_at, updated_at).
 * El offset -04:00 garantiza que Supabase (TIMESTAMPTZ) almacene el UTC correcto,
 * y que el texto de la fecha en SQLite refleje el día venezolano real.
 */
export function localNow(): string {
  const date = new Date()
  const p = veTimeParts(date)
  // Normalizar "24" a "00" (puede aparecer en algunos entornos para medianoche)
  const hour = p.hour === '24' ? '00' : p.hour
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}.${ms}${VE_OFFSET}`
}

/**
 * Convierte un timestamp en milisegundos a ISO venezolana con offset.
 * Util cuando necesitás retroceder N milisegundos desde ahora.
 * Ejemplo: timestampToVE(Date.now() - 30 * 60 * 1000) → hace 30 min en VE
 */
export function timestampToVE(ms: number): string {
  const date = new Date(ms)
  const p = veTimeParts(date)
  const hour = p.hour === '24' ? '00' : p.hour
  const millis = String(date.getMilliseconds()).padStart(3, '0')
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}.${millis}${VE_OFFSET}`
}

/** Retorna la fecha de hoy (YYYY-MM-DD) en zona horaria Venezuela */
export function todayStr(): string {
  const p = veTimeParts(new Date())
  return `${p.year}-${p.month}-${p.day}`
}

/** Retorna YYYY-MM-DD para N días atrás en zona horaria Venezuela */
export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = veTimeParts(d)
  return `${p.year}-${p.month}-${p.day}`
}

/** Retorna YYYY-MM-DD para N días adelante en zona horaria Venezuela */
export function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const p = veTimeParts(d)
  return `${p.year}-${p.month}-${p.day}`
}

/** Retorna YYYY-MM-DD para el 1ro del mes actual en zona horaria Venezuela */
export function startOfMonth(): string {
  const p = veTimeParts(new Date())
  return `${p.year}-${p.month}-01`
}
