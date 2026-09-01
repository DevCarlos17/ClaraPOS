import { formatDate, formatHora } from '@/lib/format'

/**
 * Formatea la fecha/hora de un movimiento de tesoreria (bancario o de caja
 * fuerte) para display, combinando dos fuentes DISTINTAS a proposito:
 *  - `fecha`: columna solo-dia (`YYYY-MM-DD`) que representa la fecha de
 *    NEGOCIO del movimiento. En filas MANUAL/TRASPASO el usuario la ingresa
 *    en el formulario y puede backdatear (cargar hoy un movimiento de hace
 *    dias). En filas automaticas coincide con el dia de proceso.
 *  - `created_at`: timestamp UTC completo de cuando el registro se guardo
 *    en el sistema. Es la unica fuente disponible para la HORA.
 *
 * Bug historico #1 (pre-PR#13): la hora se armaba con un slice crudo de
 * `created_at` sin convertir de UTC a VET.
 * Bug historico #2 (PR#13, regresion): al arreglar la hora, el helper paso
 * a derivar TAMBIEN el dia desde `created_at`, ignorando `fecha`. Esto hacia
 * que un movimiento backdateado mostrara la fecha de CARGA en vez de la
 * fecha de negocio ingresada por el usuario.
 *
 * Fix: el dia SIEMPRE viene de `fecha` (formatDate, ancla a mediodia VET,
 * sin riesgo de salto de dia). La hora SIEMPRE viene de `created_at`
 * (formatHora, convierte UTC -> VET).
 */
export function formatFechaHoraMovimiento(fecha: string, createdAt: string, tz?: string): string {
  return `${formatDate(fecha, tz)} ${formatHora(createdAt, tz)}`
}
