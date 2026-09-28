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
  /** Numeros de paso ya completados (1-indexed). */
  completedSteps: number[]
  /** Si se provee, los pasos completados son clickeables para navegar hacia atras. */
  onStepClick?: (step: number) => void
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
}: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center gap-0" role="group" aria-label="Pasos del asistente">
      {steps.map((s, i) => {
        const num = i + 1
        const done = completedSteps.includes(num)
        const active = currentStep === num
        const clickable = done && !!onStepClick

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
