import { useState, useEffect } from 'react'
import { localNow, todayStr, VE_TZ } from '@/lib/dates'

/**
 * Hook que provee la hora actual de Venezuela de forma reactiva (se actualiza cada minuto).
 * Ideal para componentes que muestran el reloj, la fecha actual, o necesitan
 * recalcular algo cuando cambia el minuto.
 *
 * IMPORTANTE: Para ESCRIBIR en la base de datos NO uses este hook.
 * Simplemente llamá localNow() directamente desde @/lib/dates en el momento
 * de la escritura — así capturás el instante exacto de la transacción.
 *
 * @example
 * // En un componente de display:
 * const { today, nowFormatted } = useVenezuelaTime()
 * <p>Hoy: {today}</p>
 *
 * @example
 * // En una transacción (NO usar el hook, usar la función directamente):
 * import { localNow } from '@/lib/dates'
 * const now = localNow()
 * await db.execute('INSERT INTO ventas (..., fecha) VALUES (?, ...)', [now])
 */
export function useVenezuelaTime() {
  const [nowISO, setNowISO] = useState(() => localNow())

  useEffect(() => {
    // Actualizar al inicio del próximo minuto y luego cada 60 s
    const msUntilNextMinute = (60 - new Date().getSeconds()) * 1000
    const timeout = setTimeout(() => {
      setNowISO(localNow())
      const interval = setInterval(() => setNowISO(localNow()), 60_000)
      return () => clearInterval(interval)
    }, msUntilNextMinute)

    return () => clearTimeout(timeout)
  }, [])

  return {
    /** ISO 8601 con offset venezolano, e.g. "2026-05-31T21:30:00.000-04:00" */
    nowISO,
    /** Fecha de hoy en Venezuela, e.g. "2026-05-31" */
    today: todayStr(),
    /** Zona horaria como string para Intl.DateTimeFormat */
    timezone: VE_TZ,
    /** Hora y minuto formateados para mostrar, e.g. "21:30" */
    timeFormatted: nowISO.slice(11, 16),
    /** Fecha formateada DD/MM/YYYY */
    dateFormatted: `${nowISO.slice(8, 10)}/${nowISO.slice(5, 7)}/${nowISO.slice(0, 4)}`,
  }
}
