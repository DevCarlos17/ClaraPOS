import { formatDateTime } from '@/lib/format'

/**
 * Formatea la fecha/hora de un movimiento de tesoreria (bancario o de caja
 * fuerte) para display, usando `created_at` como fuente UNICA de la hora.
 *
 * Bug historico: los helpers previos combinaban `fecha` (columna solo-dia,
 * `YYYY-MM-DD` via `todayStr()`) con un slice crudo de `created_at`
 * (`YYYY-MM-DD HH:mm:ss` UTC via `localNow()`), extrayendo los digitos UTC
 * sin pasar por ninguna conversion de zona horaria. Esto mostraba la hora en
 * UTC en vez de VET (+4h de diferencia visible al usuario).
 *
 * Fix: usar `created_at` como fuente unica y delegar en `formatDateTime`,
 * que ya normaliza la forma-espacio UTC y convierte a VET.
 */
export function formatFechaHoraMovimiento(createdAt: string, tz?: string): string {
  return formatDateTime(createdAt, tz)
}
