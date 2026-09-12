import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeudaCard } from '../deuda-card'

describe('DeudaCard', () => {
  it('renderiza numero, fecha, badge de tipo, total, pendiente y equivalente en Bs', () => {
    render(
      <DeudaCard
        id="fac-1"
        numero="#0001"
        fecha="12/09/2026"
        tipo="CREDITO"
        totalUsd="$120.00"
        totalBs="Bs 12,000.00"
        pendienteUsd="$45.50"
        pendienteBs="Bs 4,550.00"
        onAccion={vi.fn()}
      />
    )

    expect(screen.getByText('#0001')).toBeInTheDocument()
    expect(screen.getByText('12/09/2026')).toBeInTheDocument()
    expect(screen.getByText('CREDITO')).toBeInTheDocument()
    expect(screen.getByText('$120.00')).toBeInTheDocument()
    expect(screen.getByText('Bs 12,000.00')).toBeInTheDocument()
    expect(screen.getByText('$45.50')).toBeInTheDocument()
    expect(screen.getByText('Bs 4,550.00')).toBeInTheDocument()
  })

  it('dispara onAccion con el id de la fila al presionar el boton de accion', async () => {
    const onAccion = vi.fn()
    render(
      <DeudaCard
        id="fac-42"
        numero="#0042"
        fecha="01/01/2026"
        totalUsd="$10.00"
        pendienteUsd="$10.00"
        onAccion={onAccion}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }))

    expect(onAccion).toHaveBeenCalledTimes(1)
    expect(onAccion).toHaveBeenCalledWith('fac-42')
  })

  it('triangulacion: sin tipo ni montos en Bs no renderiza el badge ni las lineas Bs, y usa accionLabel custom', async () => {
    const onAccion = vi.fn()
    render(
      <DeudaCard
        id="gasto-7"
        numero="G-0007"
        detalle="Alquiler local"
        fecha="03/03/2026"
        totalUsd="$80.00"
        pendienteUsd="$80.00"
        accionLabel="Ver"
        onAccion={onAccion}
      />
    )

    expect(screen.getByText('G-0007')).toBeInTheDocument()
    expect(screen.getByText('Alquiler local')).toBeInTheDocument()
    expect(screen.queryByText('CREDITO')).not.toBeInTheDocument()
    expect(screen.queryByText('CONTADO')).not.toBeInTheDocument()

    const boton = screen.getByRole('button', { name: 'Ver' })
    await userEvent.click(boton)
    expect(onAccion).toHaveBeenCalledWith('gasto-7')
  })

  it('accionDisabled deshabilita el boton de accion', () => {
    render(
      <DeudaCard
        id="fac-99"
        numero="#0099"
        fecha="05/05/2026"
        totalUsd="$5.00"
        pendienteUsd="—"
        accionDisabled
        onAccion={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Pagar' })).toBeDisabled()
  })
})
