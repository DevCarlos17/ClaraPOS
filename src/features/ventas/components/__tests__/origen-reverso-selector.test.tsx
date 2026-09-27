import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrigenReversoSelector } from '../origen-reverso-selector'
import { resolverVistaReversoNc, type VistaReversoNc } from '../../utils/notas-credito-ui'

const vistaConDesglose: VistaReversoNc = resolverVistaReversoNc(100, 40)
const vistaSoloCancelaDeuda: VistaReversoNc = resolverVistaReversoNc(80, 80)

describe('OrigenReversoSelector (Design §D1, extracción de crear-ncr-modal.tsx:343-367)', () => {
  it('renderiza los botones "Devolver dinero" y "Credito a favor" cuando hay remanente disponible', () => {
    render(<OrigenReversoSelector value={null} onChange={vi.fn()} vista={vistaConDesglose} />)

    expect(screen.getByRole('button', { name: 'Devolver dinero' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Credito a favor' })).toBeInTheDocument()
  })

  it('sin preseleccion: ambos botones arrancan con aria-pressed="false"', () => {
    render(<OrigenReversoSelector value={null} onChange={vi.fn()} vista={vistaConDesglose} />)

    expect(screen.getByRole('button', { name: 'Devolver dinero' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Credito a favor' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('aria-pressed refleja el value elegido', () => {
    render(<OrigenReversoSelector value="DEVOLVER_DINERO" onChange={vi.fn()} vista={vistaConDesglose} />)

    expect(screen.getByRole('button', { name: 'Devolver dinero' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Credito a favor' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('llama onChange("DEVOLVER_DINERO") y onChange("CREDITO_A_FAVOR") al hacer click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<OrigenReversoSelector value={null} onChange={onChange} vista={vistaConDesglose} />)

    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))
    expect(onChange).toHaveBeenCalledWith('DEVOLVER_DINERO')

    await user.click(screen.getByRole('button', { name: 'Credito a favor' }))
    expect(onChange).toHaveBeenCalledWith('CREDITO_A_FAVOR')
  })

  it('soloCancelaDeuda=true: muestra SOLO el copy de cancelacion, sin botones', () => {
    render(<OrigenReversoSelector value={null} onChange={vi.fn()} vista={vistaSoloCancelaDeuda} />)

    expect(
      screen.getByText('Esta nota de crédito cancela $80.00 de la deuda pendiente de la factura.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Devolver dinero' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Credito a favor' })).not.toBeInTheDocument()
  })

  it('soloCancelaDeuda=false: muestra el desglose con los montos exactos + los 2 botones', () => {
    render(<OrigenReversoSelector value={null} onChange={vi.fn()} vista={vistaConDesglose} />)

    expect(
      screen.getByText('De $100.00: $40.00 cancela deuda pendiente, $60.00 disponible')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Devolver dinero' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Credito a favor' })).toBeInTheDocument()
  })

  it('boundary: montoDisponible exactamente 0.01 (soloCancelaDeuda=true) renderiza la vista de solo-confirmacion, no el desglose', () => {
    const vistaBoundary = resolverVistaReversoNc('100.01', '100')
    expect(vistaBoundary.soloCancelaDeuda).toBe(true)

    render(<OrigenReversoSelector value={null} onChange={vi.fn()} vista={vistaBoundary} />)

    expect(screen.queryByRole('button', { name: 'Devolver dinero' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Credito a favor' })).not.toBeInTheDocument()
  })
})
