import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WizardStepIndicator } from '../wizard-step-indicator'

const STEPS = [
  { label: 'Identificacion' },
  { label: 'Monto' },
  { label: 'Pagos' },
]

describe('WizardStepIndicator', () => {
  it('renderiza todos los pasos con su label y marca el paso activo con aria-current', () => {
    render(
      <WizardStepIndicator steps={STEPS} currentStep={2} completedSteps={[1]} />
    )

    expect(screen.getByText('Identificacion')).toBeInTheDocument()
    expect(screen.getByText('Monto')).toBeInTheDocument()
    expect(screen.getByText('Pagos')).toBeInTheDocument()

    const activeButton = screen.getByText('Monto').closest('button')
    expect(activeButton).toHaveAttribute('aria-current', 'step')
  })

  it('un paso completado es clickeable y dispara onStepClick con su numero', async () => {
    const onStepClick = vi.fn()
    render(
      <WizardStepIndicator
        steps={STEPS}
        currentStep={2}
        completedSteps={[1]}
        onStepClick={onStepClick}
      />
    )

    const completedButton = screen.getByText('Identificacion').closest('button')
    expect(completedButton).not.toBeDisabled()

    await userEvent.click(completedButton!)

    expect(onStepClick).toHaveBeenCalledTimes(1)
    expect(onStepClick).toHaveBeenCalledWith(1)
  })

  it('un paso pendiente (no completado) no es clickeable aunque se provea onStepClick', async () => {
    const onStepClick = vi.fn()
    render(
      <WizardStepIndicator
        steps={STEPS}
        currentStep={2}
        completedSteps={[1]}
        onStepClick={onStepClick}
      />
    )

    const pendingButton = screen.getByText('Pagos').closest('button')
    expect(pendingButton).toBeDisabled()

    await userEvent.click(pendingButton!)

    expect(onStepClick).not.toHaveBeenCalled()
  })

  it('sin onStepClick, ningun paso es clickeable aunque este completado', () => {
    render(
      <WizardStepIndicator steps={STEPS} currentStep={2} completedSteps={[1]} />
    )

    const completedButton = screen.getByText('Identificacion').closest('button')
    expect(completedButton).toBeDisabled()
  })
})
