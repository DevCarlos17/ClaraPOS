import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RefundTesoreriaForm } from '../refund-tesoreria-form'
import { useCuentasTesoreria } from '@/features/tesoreria/hooks/use-cuentas-tesoreria'

/**
 * Slice 5 (nc-refund-tesoreria, tasks.md Phase 5): mini-formulario AISLADO,
 * `onConfirm` mockeado — CERO acoplamiento con el motor de
 * `crearNotaCredito` (Design §Interfaces). Reusa `useCuentasTesoreria()`
 * (mockeado aqui) para listar banco/caja fuerte con saldo disponible.
 */
vi.mock('@/features/tesoreria/hooks/use-cuentas-tesoreria', () => ({
  useCuentasTesoreria: vi.fn(),
}))

const mockedUseCuentasTesoreria = vi.mocked(useCuentasTesoreria)

function cuentasFixture() {
  return {
    cuentas: [
      {
        id: 'banco-usd-1',
        tipo: 'BANCO' as const,
        nombre: 'Banco Mercantil USD',
        moneda_id: 'moneda-usd',
        moneda_codigo: 'USD',
        moneda_simbolo: '$',
        saldo_actual: '500.00',
        is_active: true,
        detalle: {} as never,
      },
      {
        id: 'caja-1',
        tipo: 'CAJA_FUERTE' as const,
        nombre: 'Caja Fuerte Principal',
        moneda_id: 'moneda-usd',
        moneda_codigo: 'USD',
        moneda_simbolo: '$',
        saldo_actual: '200.00',
        is_active: true,
        detalle: {} as never,
      },
    ],
    bancos: [],
    cajas: [],
    isLoading: false,
  }
}

describe('RefundTesoreriaForm (Slice 5, aislado — onConfirm mockeado)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseCuentasTesoreria.mockReturnValue(cuentasFixture())
  })

  it('Scenario "Selector muestra saldo por cuenta": cada opcion de cuenta muestra su saldo disponible junto al nombre', () => {
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    const selects = screen.getAllByRole('combobox')
    const cuentaSelect = selects[1]! // [0]=destino BANCO/CAJA_FUERTE, [1]=cuenta
    expect(cuentaSelect).toHaveTextContent('Banco Mercantil USD')
    expect(cuentaSelect).toHaveTextContent('500.00')
  })

  it('"+ Agregar cuenta" agrega una segunda linea de egreso al formulario', async () => {
    const user = userEvent.setup()
    render(<RefundTesoreriaForm montoDisponibleUsd={200} tasaHistorica={40} onConfirm={vi.fn()} />)

    const cuentaSelectsAntes = screen.getAllByLabelText(/cuenta de tesoreria/i)
    expect(cuentaSelectsAntes).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: /Agregar cuenta/i }))

    const cuentaSelectsDespues = screen.getAllByLabelText(/cuenta de tesoreria/i)
    expect(cuentaSelectsDespues).toHaveLength(2)
  })

  it('calculo en vivo de "pendiente por reembolsar": monto ingresado en una cuenta USD reduce el pendiente mostrado', async () => {
    const user = userEvent.setup()
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
    await user.type(screen.getByLabelText(/monto/i), '60')

    expect(screen.getByText(/40\.00/)).toBeInTheDocument()
  })

  it('submit deshabilitado cuando la suma de lineas excede el monto disponible de la NC', async () => {
    const user = userEvent.setup()
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
    await user.type(screen.getByLabelText(/monto/i), '150')

    expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
    expect(screen.getByText(/excede/i)).toBeInTheDocument()
  })

  it('confirmar con datos validos invoca onConfirm con un array EgresoTesoreriaLinea', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

    await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
    await user.type(screen.getByLabelText(/monto/i), '60')

    const boton = screen.getByRole('button', { name: /Confirmar/i })
    expect(boton).not.toBeDisabled()
    await user.click(boton)

    expect(onConfirm).toHaveBeenCalledWith([
      { destino: 'BANCO', cuentaId: 'banco-usd-1', montoEnMonedaCuenta: '60' },
    ])
  })
})
