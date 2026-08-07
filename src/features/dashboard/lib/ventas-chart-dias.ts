export interface VentaPorDia {
  dia: string
  totalUsd: number
}

/**
 * Genera las claves de dia (YYYY-MM-DD) para un rango [fechaInicio, fechaFin],
 * rellenando con totalUsd 0 los dias sin ventas.
 *
 * Usa el constructor numerico `new Date(y, m-1, d)` (siempre local, sin
 * reparseo UTC-medianoche) para evitar el bug de corte 20:00 VET descrito
 * en src/lib/dates.ts. NUNCA usar `new Date(fechaStr)` con un string
 * "YYYY-MM-DD" aqui: eso se interpreta como UTC medianoche, que en VET
 * (UTC-4) es las 20:00 del dia anterior.
 */
export function buildVentasPorDia(
  fechaInicio: string,
  fechaFin: string,
  ventas: VentaPorDia[]
): VentaPorDia[] {
  const days: VentaPorDia[] = []
  const ventasMap = new Map(ventas.map((v) => [v.dia, v.totalUsd]))

  const [sy, sm, sd] = fechaInicio.split('-').map(Number)
  const [ey, em, ed] = fechaFin.split('-').map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ dia: key, totalUsd: ventasMap.get(key) ?? 0 })
  }

  return days
}
