import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WizardAcumulador } from '../wizard-acumulador'

const LINEAS = [
  { id: 'l1', titulo: 'Producto A', subtitulo: 'x2 UND', montoUsd: 100, montoBs: 4000 },
  { id: 'l2', titulo: 'Producto B', montoUsd: 34.56, montoBs: 1382.4 },
]

describe('WizardAcumulador', () => {
  it('colapsado por defecto muestra el conteo de items y el total, sin las lineas', () => {
    render(
      <WizardAcumulador
        lineas={LINEAS}
        total={{ usd: 134.56, bs: 5382.4 }}
      />
    )

    expect(screen.getByText(/2 items/)).toBeInTheDocument()
    expect(screen.getByText('$134.56')).toBeInTheDocument()
    expect(screen.queryByText('Producto A')).not.toBeInTheDocument()
  })

  it('al hacer click se expande y muestra las lineas y el footer de total', async () => {
    render(
      <WizardAcumulador
        lineas={LINEAS}
        total={{ usd: 134.56, bs: 5382.4 }}
      />
    )

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Producto A')).toBeInTheDocument()
    expect(screen.getByText('x2 UND')).toBeInTheDocument()
    expect(screen.getByText('Producto B')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('con defaultCollapsed=false inicia expandido', () => {
    render(
      <WizardAcumulador
        lineas={LINEAS}
        total={{ usd: 134.56, bs: 5382.4 }}
        defaultCollapsed={false}
      />
    )

    expect(screen.getByText('Producto A')).toBeInTheDocument()
  })

  it('expandido y sin lineas muestra el emptyMessage', async () => {
    render(
      <WizardAcumulador
        lineas={[]}
        total={{ usd: 0, bs: 0 }}
        emptyMessage="Aun no hay items"
      />
    )

    await userEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Aun no hay items')).toBeInTheDocument()
  })

  it('un item singular muestra "1 item" (singular, no plural)', () => {
    render(
      <WizardAcumulador
        lineas={[LINEAS[0]]}
        total={{ usd: 100, bs: 4000 }}
      />
    )

    expect(screen.getByText(/1 item(?!s)/)).toBeInTheDocument()
  })
})
