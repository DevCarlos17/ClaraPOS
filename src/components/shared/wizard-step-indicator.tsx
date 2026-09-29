import { CheckCircle } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface WizardStepIndicatorStep {
  label: string
}

export interface WizardStepIndicatorProps {
  /** Pasos del wizard, en orden. */
  steps: WizardStepIndicatorStep[]
  /** Numero del paso activo (1-indexed). */
  currentStep: number
  /** Numeros de paso ya completados (1-indexed). Muestran check relleno. */
  completedSteps: number[]
  /** Si se provee, los pasos completados son clickeables para navegar hacia atras. */
  onStepClick?: (step: number) => void
  /**
   * Navegacion libre: TODOS los pasos son clickeables (no solo los
   * completados) y NO se muestran checks — solo se ilumina el paso activo.
   * Default `false` (comportamiento clasico: check en completados + click solo
   * hacia atras). Usado por el wizard de gasto (mobile).
   */
  freeNavigation?: boolean
}

/**
 * Indicador de pasos reutilizable para wizards moviles: circulos numerados
 * conectados por lineas, con estado activo/completado/pendiente.
 * Generalizado a partir de `nueva-cita-wizard.tsx`.
 */
export function WizardStepIndicator({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  freeNavigation = false,
}: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center gap-0" role="group" aria-label="Pasos del asistente">
      {steps.map((s, i) => {
        const num = i + 1
        // En navegacion libre NO hay checks: solo el paso activo se ilumina.
        const done = freeNavigation ? false : completedSteps.includes(num)
        const active = currentStep === num
        const clickable = freeNavigation ? !!onStepClick : done && !!onStepClick

        return (
          <div key={num} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              onClick={() => clickable && onStepClick?.(num)}
              className={cn(
                'flex items-center gap-2 shrink-0 transition-all',
                clickable ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all',
                  done
                    ? 'bg-primary border-primary text-primary-foreground'
                    : active
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-border text-muted-foreground bg-background'
                )}
              >
                {done ? <CheckCircle size={16} weight="fill" /> : num}
              </div>
              <span
                className={cn(
                  'text-xs font-medium hidden sm:block',
                  active ? 'text-primary' : done ? 'text-primary/70' : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn('flex-1 h-0.5 mx-2 transition-all', done ? 'bg-primary' : 'bg-border')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
