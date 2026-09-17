import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RefundTesoreriaForm } from '../refund-tesoreria-form'
import { useCuentasTesoreria } from '@/features/tesoreria/hooks/use-cuentas-tesoreria'
import { useSesionesActivas } from '@/features/caja/hooks/use-sesiones-caja'

/**
 * Slice 5 (nc-refund-tesoreria, tasks.md Phase 5): mini-formulario AISLADO,
 * `onConfirm` mockeado — CERO acoplamiento con el motor de
 * `crearNotaCredito` (Design §Interfaces). Reusa `useCuentasTesoreria()`
 * (mockeado aqui) para listar banco/caja fuerte con saldo disponible.
 *
 * Restructuracion UI a dos selects dependientes (Origen -> Cuenta): Select 1
 * ("Origen") ofrece "Tesoreria" (unica opcion habilitada) y una opcion
 * deshabilitada por cada sesion de caja ACTIVA (reusa `useSesionesActivas()`,
 * mockeado aqui, en modo solo-lectura — ninguna logica nueva de sesiones).
 * Select 2 ("Cuenta") sigue siendo la MISMA fuente `useCuentasTesoreria()`,
 * ahora sin el filtro previo por tipo BANCO/CAJA_FUERTE (el `destino` del
 * egreso se deriva de `cuenta.tipo` en vez de seleccionarse por separado).
 */
vi.mock('@/features/tesoreria/hooks/use-cuentas-tesoreria', () => ({
  useCuentasTesoreria: vi.fn(),
}))
vi.mock('@/features/caja/hooks/use-sesiones-caja', () => ({
  useSesionesActivas: vi.fn(),
}))

const mockedUseCuentasTesoreria = vi.mocked(useCuentasTesoreria)
const mockedUseSesionesActivas = vi.mocked(useSesionesActivas)

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
    mockedUseSesionesActivas.mockReturnValue({ sesiones: [], isLoading: false })
  })

  it('Scenario "Selector muestra saldo por cuenta": cada opcion de cuenta muestra su saldo disponible junto al nombre', () => {
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    const selects = screen.getAllByRole('combobox')
    const cuentaSelect = selects[1]! // [0]=Origen (Tesoreria/Sesion), [1]=cuenta
    expect(cuentaSelect).toHaveTextContent('Banco Mercantil USD')
    expect(cuentaSelect).toHaveTextContent('500.00')
  })

  it('Scenario "Select Origen habilita Tesoreria y deshabilita sesiones activas": Tesoreria es seleccionable, cada sesion activa aparece deshabilitada con indicacion "Proximamente"', () => {
    mockedUseSesionesActivas.mockReturnValue({
      sesiones: [{ id: 'sesion-1', caja_nombre: 'Caja Principal' } as never],
      isLoading: false,
    })
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    const origenSelect = screen.getAllByRole('combobox')[0]!
    expect(origenSelect).toHaveValue('TESORERIA')

    const opcionTesoreria = screen.getByRole('option', { name: /^Tesoreria$/i })
    expect(opcionTesoreria).toBeEnabled()

    const opcionSesion = screen.getByRole('option', { name: /Caja Principal.*Proximamente/i })
    expect(opcionSesion).toBeDisabled()
  })

  it('Scenario "Sin sesiones activas": Select Origen solo ofrece Tesoreria, sin opciones de sesion', () => {
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    const origenSelect = screen.getAllByRole('combobox')[0]!
    expect(origenSelect.querySelectorAll('option')).toHaveLength(1)
  })

  it('Scenario "Origen Tesoreria puebla Select Cuenta con banco y caja fuerte combinados": ambos tipos aparecen en la misma lista, cada uno con su saldo', () => {
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    const cuentaSelect = screen.getAllByRole('combobox')[1]!
    expect(cuentaSelect).toHaveTextContent('Banco Mercantil USD')
    expect(cuentaSelect).toHaveTextContent('500.00')
    expect(cuentaSelect).toHaveTextContent('Caja Fuerte Principal')
    expect(cuentaSelect).toHaveTextContent('200.00')
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
      { destino: 'BANCO', cuentaId: 'banco-usd-1', montoEnMonedaCuenta: '60', referencia: undefined },
    ])
  })

  describe('Campo "Referencia" opcional por linea (UX rework, nc-refund-tesoreria)', () => {
    it('cada linea expone un campo de texto "Referencia" con etiqueta asociada, distinto del Monto', () => {
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      const referencia = screen.getByLabelText(/^Referencia/i)
      expect(referencia).toBeInTheDocument()
      expect(referencia).toHaveAttribute('type', 'text')
    })

    it('dejar la Referencia vacia NO bloquea "Confirmar reembolso" (es opcional)', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      await user.type(screen.getByLabelText(/monto/i), '60')

      expect(screen.getByRole('button', { name: /Confirmar/i })).not.toBeDisabled()
      await user.click(screen.getByRole('button', { name: /Confirmar/i }))

      expect(onConfirm).toHaveBeenCalledWith([
        expect.objectContaining({ referencia: undefined }),
      ])
    })

    it('escribir una Referencia la emite en la linea correspondiente de EgresoTesoreriaLinea al confirmar', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      await user.type(screen.getByLabelText(/monto/i), '60')
      await user.type(screen.getByLabelText(/^Referencia/i), 'TRF-00123')

      await user.click(screen.getByRole('button', { name: /Confirmar/i }))

      expect(onConfirm).toHaveBeenCalledWith([
        { destino: 'BANCO', cuentaId: 'banco-usd-1', montoEnMonedaCuenta: '60', referencia: 'TRF-00123' },
      ])
    })

    it('con dos lineas, cada Referencia y Monto se asocia SOLO a su propia cuenta (sin cruzar valores)', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RefundTesoreriaForm montoDisponibleUsd={200} tasaHistorica={40} onConfirm={onConfirm} />)

      await user.click(screen.getByRole('button', { name: /Agregar cuenta/i }))

      const cuentaSelects = screen.getAllByLabelText(/cuenta de tesoreria/i)
      const montoInputs = screen.getAllByLabelText(/^monto$/i)
      const referenciaInputs = screen.getAllByLabelText(/^Referencia/i)

      await user.selectOptions(cuentaSelects[0]!, 'banco-usd-1')
      await user.type(montoInputs[0]!, '30')
      await user.type(referenciaInputs[0]!, 'REF-A')

      await user.selectOptions(cuentaSelects[1]!, 'caja-1')
      await user.type(montoInputs[1]!, '20')
      await user.type(referenciaInputs[1]!, 'REF-B')

      await user.click(screen.getByRole('button', { name: /Confirmar/i }))

      expect(onConfirm).toHaveBeenCalledWith([
        { destino: 'BANCO', cuentaId: 'banco-usd-1', montoEnMonedaCuenta: '30', referencia: 'REF-A' },
        { destino: 'CAJA_FUERTE', cuentaId: 'caja-1', montoEnMonedaCuenta: '20', referencia: 'REF-B' },
      ])
    })
  })

  it('renderiza un `motivoSlot` opcional entre "+ Agregar cuenta" y "Pendiente por reembolsar"', () => {
    render(
      <RefundTesoreriaForm
        montoDisponibleUsd={100}
        tasaHistorica={40}
        onConfirm={vi.fn()}
        motivoSlot={<div data-testid="motivo-slot">Motivo aqui</div>}
      />
    )

    expect(screen.getByTestId('motivo-slot')).toBeInTheDocument()
  })
})
