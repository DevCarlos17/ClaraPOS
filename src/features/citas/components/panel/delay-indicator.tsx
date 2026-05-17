import { cn } from '@/lib/utils'
import { WarningCircle } from '@phosphor-icons/react'
import type { Cita } from '../../hooks/use-citas'

interface DelayIndicatorProps {
  citas: Cita[]
  profesionalId: string
  className?: string
}

/**
 * Calcula el retraso acumulado de un profesional.
 * Si hay una cita EN_PROCESO que ya deberia haber terminado,
 * las citas siguientes se retrasan en cascada.
 */
function calcularRetrasoMin(citas: Cita[], profesionalId: string): number {
  const ahora = Date.now()

  const citasProf = citas
    .filter(
      (c) =>
        c.profesional_id === profesionalId &&
        (c.cita_status === 'EN_PROCESO' || c.cita_status === 'RESERVADA')
    )
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))

  let retrasoAcumuladoMs = 0

  for (const cita of citasProf) {
    const fechaFin = new Date(cita.fecha_fin).getTime()

    if (cita.cita_status === 'EN_PROCESO') {
      // Si ya paso la hora de fin estimada, calcular el exceso
      if (ahora > fechaFin) {
        retrasoAcumuladoMs += ahora - fechaFin
      }
    } else if (cita.cita_status === 'RESERVADA') {
      // Esta cita se retrasa por el acumulado anterior
      const fechaInicioEstimada = new Date(cita.fecha_inicio).getTime()
      if (retrasoAcumuladoMs > 0 && fechaInicioEstimada < ahora + retrasoAcumuladoMs) {
        // La cita ya deberia haber comenzado segun el retraso acumulado
        retrasoAcumuladoMs = Math.max(
          retrasoAcumuladoMs,
          ahora + retrasoAcumuladoMs - fechaInicioEstimada
        )
      }
    }
  }

  return Math.round(retrasoAcumuladoMs / 60000)
}

export function DelayIndicator({ citas, profesionalId, className }: DelayIndicatorProps) {
  const retrasoMin = calcularRetrasoMin(citas, profesionalId)

  if (retrasoMin <= 0) return null

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium',
        className
      )}
    >
      <WarningCircle size={14} className="shrink-0" />
      +{retrasoMin} min de retraso estimado
    </div>
  )
}

export { calcularRetrasoMin }
