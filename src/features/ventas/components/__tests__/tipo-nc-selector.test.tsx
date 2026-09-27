import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TipoNcSelector } from '../tipo-nc-selector'

describe('TipoNcSelector (Design §D1, extracción de crear-ncr-modal.tsx:303-334 / nota-credito-pos-modal.tsx:563-596)', () => {
  it('renderiza los botones Total y Parcial cuando puedeTotal=true', () => {
    render(<TipoNcSelector tipoNc={null} onChange={vi.fn()} puedeTotal />)

    expect(screen.getByRole('button', { name: 'Total' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parcial' })).toBeInTheDocument()
  })

  it('oculta el boton Total y muestra el warning cuando puedeTotal=false', () => {
    render(<TipoNcSelector tipoNc={null} onChange={vi.fn()} puedeTotal={false} />)

    expect(screen.queryByRole('button', { name: 'Total' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parcial' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Esta factura ya tiene una NC parcial aplicada — solo se puede reversar el remanente por linea.'
      )
    ).toBeInTheDocument()
  })

  it('aria-pressed refleja el valor de tipoNc', () => {
    render(<TipoNcSelector tipoNc="TOTAL" onChange={vi.fn()} puedeTotal />)

    expect(screen.getByRole('button', { name: 'Total' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Parcial' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('llama onChange("TOTAL") al hacer click en Total y onChange("PARCIAL") al hacer click en Parcial', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TipoNcSelector tipoNc={null} onChange={onChange} puedeTotal />)

    await user.click(screen.getByRole('button', { name: 'Total' }))
    expect(onChange).toHaveBeenCalledWith('TOTAL')

    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    expect(onChange).toHaveBeenCalledWith('PARCIAL')
  })
})
