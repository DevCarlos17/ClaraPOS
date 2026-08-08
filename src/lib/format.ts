import { VE_TZ, VE_OFFSET } from './dates'

const BARE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SPACE_FORM_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/

/**
 * Parsea un string de fecha/hora tolerando las 3 formas que puede tener un
 * registro en este sistema:
 *  - Solo-dia "YYYY-MM-DD": se ancla a mediodia VET (guard bug #3, ver abajo).
 *  - "Forma-espacio" post-sync de PowerSync/Supabase "YYYY-MM-DD HH:mm:ss[.sss]"
 *    (TIMESTAMPTZ sincronizado sin offset explicito): SIEMPRE representa un
 *    instante UTC. `new Date()` la parsearia como hora LOCAL del OS del runtime
 *    (no UTC), porque no es ISO-8601 estricto — se normaliza a ISO-UTC explicito
 *    antes de parsear para evitar ese bug.
 *  - Cualquier otra forma (ISO con 'T' + offset/Z): se delega a `new Date()` tal cual.
 *
 * LIMITACION CONOCIDA: el anclaje de fechas solo-dia SIEMPRE usa VE_OFFSET, sin
 * importar el `tz` que use luego el caller para el display. Es correcto hoy
 * (unico consumidor es VET), pero si se activa `empresas.timezone` para un
 * tenant no-VET, este anclaje necesitara resolver el offset real de `tz` en vez
 * de asumir VE_OFFSET. No se resuelve en este cambio (no hay consumidores no-VET
 * todavia).
 */
function parseFlexibleDate(dateStr: string): Date {
  if (BARE_DATE_RE.test(dateStr)) {
    return new Date(`${dateStr}T12:00:00${VE_OFFSET}`)
  }
  const spaceMatch = SPACE_FORM_RE.exec(dateStr)
  if (spaceMatch) {
    return new Date(`${spaceMatch[1]}T${spaceMatch[2]}Z`)
  }
  return new Date(dateStr)
}

/**
 * Formatea cualquier string de fecha/hora ISO (con o sin offset) como DD/MM/YYYY
 * en la zona horaria indicada (default Venezuela). Funciona tanto con registros
 * antiguos (UTC con Z) como con registros nuevos (-04:00).
 *
 * @param tz Zona horaria IANA para el display. Default VE_TZ. Puerta de entrada
 * para cuando `empresas.timezone` se active por-tenant (aun no consumido).
 */
export function formatDate(dateStr: string, tz: string = VE_TZ): string {
  try {
    const date = parseFlexibleDate(dateStr)
    if (isNaN(date.getTime())) return dateStr
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
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
 * en la zona horaria indicada (default Venezuela).
 *
 * @param tz Zona horaria IANA para el display. Default VE_TZ.
 */
export function formatDateTime(dateStr: string, tz: string = VE_TZ): string {
  try {
    const date = parseFlexibleDate(dateStr)
    if (isNaN(date.getTime())) return dateStr
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
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
 * Extrae solo la hora (HH:mm) de un string ISO en la zona horaria indicada
 * (default Venezuela).
 *
 * @param tz Zona horaria IANA para el display. Default VE_TZ.
 */
export function formatHora(dateStr: string, tz: string = VE_TZ): string {
  try {
    const date = parseFlexibleDate(dateStr)
    if (isNaN(date.getTime())) return ''
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
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

/**
 * Formatea una fecha como "mmm. aa" (mes abreviado + anio de 2 digitos, es-VE)
 * en la zona horaria indicada (default Venezuela). Pensado para ejes de
 * grafico mensuales (ej. conciliacion bancaria). Fechas solo-dia (YYYY-MM-DD)
 * anclan a mediodia VET igual que formatDate/formatDateTime (mismo guard bug #3
 * y misma limitacion conocida: el anclaje ignora `tz`).
 *
 * @param tz Zona horaria IANA para el display. Default VE_TZ.
 */
export function formatMesAnio(dateStr: string, tz: string = VE_TZ): string {
  try {
    const date = parseFlexibleDate(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: tz,
      month: 'short',
      year: '2-digit',
    }).format(date)
  } catch {
    return dateStr
  }
}

/**
 * Formatea un uuid de sesion de caja como identificador legible SES-XXXXXXXX
 * (primeros 8 caracteres del uuid en mayusculas). No es correlativo secuencial.
 */
export function formatSesionId(id: string): string {
  return `SES-${id.slice(0, 8).toUpperCase()}`
}

export function formatNumber(val: number | string, decimals = 2): string {
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '0'
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
