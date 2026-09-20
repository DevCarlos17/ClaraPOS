import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrigenReversoSelector } from '../origen-reverso-selector'

describe('OrigenReversoSelector (Design §D1, extracción de crear-ncr-modal.tsx:343-367)', () => {
  it('renderiza los botones "Devolver dinero" y "Credito a favor"', () => {
    render(<OrigenReversoSelector value={null} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Devolver dinero' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Credito a favor' })).toBeInTheDocument()
  })

  it('sin preseleccion: ambos botones arrancan con aria-pressed="false"', () => {
    render(<OrigenReversoSelector value={null} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Devolver dinero' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Credito a favor' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('aria-pressed refleja el value elegido', () => {
    render(<OrigenReversoSelector value="DEVOLVER_DINERO" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Devolver dinero' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Credito a favor' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('llama onChange("DEVOLVER_DINERO") y onChange("CREDITO_A_FAVOR") al hacer click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<OrigenReversoSelector value={null} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))
    expect(onChange).toHaveBeenCalledWith('DEVOLVER_DINERO')

    await user.click(screen.getByRole('button', { name: 'Credito a favor' }))
    expect(onChange).toHaveBeenCalledWith('CREDITO_A_FAVOR')
  })
})
