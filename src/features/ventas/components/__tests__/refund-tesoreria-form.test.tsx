import { render, screen, within } from '@testing-library/react'
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

    expect(screen.getByText(/\$40\.00 \/ Bs/)).toBeInTheDocument()
  })

  it('submit deshabilitado cuando la suma de lineas excede el monto disponible de la NC', async () => {
    const user = userEvent.setup()
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
    await user.type(screen.getByLabelText(/monto/i), '150')

    expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
    expect(screen.getByText(/excede/i)).toBeInTheDocument()
  })

  it('confirmar con datos validos invoca onConfirm con un array EgresoTesoreriaLinea (via el gate de saldo a favor, porque 60 de 100 deja remanente)', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

    await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
    await user.type(screen.getByLabelText(/monto/i), '60')

    const boton = screen.getByRole('button', { name: /Confirmar/i })
    expect(boton).not.toBeDisabled()
    await user.click(boton)
    await user.click(screen.getByRole('button', { name: /Confirmar de todas formas/i }))

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
      await user.click(screen.getByRole('button', { name: /Confirmar de todas formas/i }))

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
      await user.click(screen.getByRole('button', { name: /Confirmar de todas formas/i }))

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

      // 30 + 20 = 50 de 200 disponibles -> deja remanente -> pasa por el gate
      await user.click(screen.getByRole('button', { name: /Confirmar/i }))
      await user.click(screen.getByRole('button', { name: /Confirmar de todas formas/i }))

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

  describe('UX rework (nc-refund-tesoreria): sin spinners, Bs en pendiente y gate de confirmacion de saldo a favor', () => {
    it('el input de Monto no muestra las flechas de spinner nativas del navegador (mismo patron [appearance:textfield] que el resto del codebase)', () => {
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      const montoInput = screen.getByLabelText(/^monto$/i)
      expect(montoInput).toHaveClass('[appearance:textfield]')
      expect(montoInput).toHaveClass('[&::-webkit-outer-spin-button]:appearance-none')
      expect(montoInput).toHaveClass('[&::-webkit-inner-spin-button]:appearance-none')
    })

    it('"Pendiente por reembolsar" muestra tambien el equivalente en Bs, convertido a la tasa HISTORICA de la NC (no la tasa vigente)', () => {
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      // 100 USD pendiente * tasaHistorica 40 = 4000 Bs
      expect(screen.getByText(/\$100\.00 \/ Bs\. 4\.000,00/)).toBeInTheDocument()
    })

    it('el equivalente en Bs de "Pendiente por reembolsar" se recalcula en vivo a medida que se llenan lineas', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      await user.type(screen.getByLabelText(/monto/i), '60')

      // Pendiente 40 USD * tasaHistorica 40 = 1600 Bs
      expect(screen.getByText(/\$40\.00 \/ Bs\. 1\.600,00/)).toBeInTheDocument()
    })

    it('el boton de confirmar usa el label normal "Confirmar reembolso" cuando el reembolso cubre el 100% (remanente 0)', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      await user.type(screen.getByLabelText(/monto/i), '100')

      expect(screen.getByRole('button', { name: /^Confirmar reembolso$/i })).toBeInTheDocument()
    })

    it('el boton de confirmar indica el remanente que quedara como saldo a favor cuando el reembolso es parcial', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      await user.type(screen.getByLabelText(/monto/i), '60')

      expect(
        screen.getByRole('button', { name: /Confirmar reembolso \(queda \$40\.00 como saldo a favor\)/i })
      ).toBeInTheDocument()
    })

    it('con reembolso completo (remanente 0), Confirmar invoca onConfirm DIRECTAMENTE — sin dialogo adicional de saldo a favor', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      await user.type(screen.getByLabelText(/monto/i), '100')

      await user.click(screen.getByRole('button', { name: /^Confirmar reembolso$/i }))

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(screen.queryByText(/saldo a favor del cliente/i)).not.toBeInTheDocument()
    })

    it('con remanente > 0, clickear Confirmar abre un dialogo de confirmacion de saldo a favor y NO llama onConfirm todavia', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      await user.type(screen.getByLabelText(/monto/i), '60')

      await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(queda/i }))

      expect(onConfirm).not.toHaveBeenCalled()
      const dialog = screen.getByRole('alertdialog')
      expect(within(dialog).getByText(/Quedará saldo a favor del cliente/i)).toBeInTheDocument()
      // Menciona el monto en USD y en Bs a tasa historica
      expect(within(dialog).getByText(/\$40\.00/)).toBeInTheDocument()
      expect(within(dialog).getByText(/Bs\. 1\.600,00/)).toBeInTheDocument()
    })

    it('cancelar el dialogo de saldo a favor cierra el dialogo sin invocar onConfirm', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      await user.type(screen.getByLabelText(/monto/i), '60')
      await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(queda/i }))

      await user.click(screen.getByRole('button', { name: /^Cancelar$/i }))

      expect(onConfirm).not.toHaveBeenCalled()
      expect(screen.queryByText(/Quedará saldo a favor del cliente/i)).not.toBeInTheDocument()
    })

    it('confirmar el dialogo de saldo a favor invoca onConfirm con el mismo array EgresoTesoreriaLinea de siempre', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      await user.type(screen.getByLabelText(/monto/i), '60')
      await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(queda/i }))

      await user.click(screen.getByRole('button', { name: /Confirmar de todas formas/i }))

      expect(onConfirm).toHaveBeenCalledWith([
        { destino: 'BANCO', cuentaId: 'banco-usd-1', montoEnMonedaCuenta: '60', referencia: undefined },
      ])
    })
  })
})
