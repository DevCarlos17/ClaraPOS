import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RefundTesoreriaForm } from '../refund-tesoreria-form'
import { useCuentasTesoreria } from '@/features/tesoreria/hooks/use-cuentas-tesoreria'
import { useSesionesActivas, useSaldoSesionCaja } from '@/features/caja/hooks/use-sesiones-caja'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'

/**
 * Slice 5 (nc-refund-tesoreria, tasks.md Phase 5): mini-formulario AISLADO,
 * `onConfirm` mockeado — CERO acoplamiento con el motor de
 * `crearNotaCredito` (Design §Interfaces). Reusa `useCuentasTesoreria()`
 * (mockeado aqui) para listar banco/caja fuerte con saldo disponible.
 *
 * Restructuracion UI a dos selects dependientes (Origen -> Cuenta): Select 1
 * ("Origen") ofrece "Tesoreria" (unica opcion habilitada) y una opcion por
 * cada sesion de caja ACTIVA (reusa `useSesionesActivas()`, mockeado aqui,
 * en modo solo-lectura — ninguna logica nueva de sesiones). Select 2
 * ("Cuenta") sigue siendo la MISMA fuente `useCuentasTesoreria()` para
 * Origen=Tesoreria (banco/caja fuerte combinados, `destino` derivado de
 * `cuenta.tipo`); para Origen=Sesion, lista "Efectivo USD"/"Efectivo Bs"
 * desde `useMetodosPagoActivos()` filtrado `tipo==='EFECTIVO'` (Slice 3,
 * nc-cuadre-sesion-fase2, Design §1/§Interfaces) — mismo patron que
 * INGRESO_MANUAL/EGRESO_MANUAL/AVANCE/PRESTAMO.
 */
vi.mock('@/features/tesoreria/hooks/use-cuentas-tesoreria', () => ({
  useCuentasTesoreria: vi.fn(),
}))
vi.mock('@/features/caja/hooks/use-sesiones-caja', () => ({
  useSesionesActivas: vi.fn(),
  useSaldoSesionCaja: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-payment-methods', () => ({
  useMetodosPagoActivos: vi.fn(),
}))

const mockedUseCuentasTesoreria = vi.mocked(useCuentasTesoreria)
const mockedUseSesionesActivas = vi.mocked(useSesionesActivas)
const mockedUseMetodosPagoActivos = vi.mocked(useMetodosPagoActivos)
const mockedUseSaldoSesionCaja = vi.mocked(useSaldoSesionCaja)

function metodoEfectivo(id: string, moneda: 'USD' | 'BS') {
  return { id, tipo: 'EFECTIVO', moneda, is_active: 1 } as never
}

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
    mockedUseMetodosPagoActivos.mockReturnValue({
      metodos: [metodoEfectivo('efectivo-usd-1', 'USD'), metodoEfectivo('efectivo-bs-1', 'BS')],
      isLoading: false,
    })
    // Default ALTO (no 0): los tests existentes de "Sesion de caja activa"
    // ya escriben montos como '100'/'4000' en lineas de Sesion — un default
    // de 0 los rompe con el guard de excedeSaldoDisponible (Phase 3) antes
    // de que esos tests siquiera lleguen a ejecutarse (tasks.md 2.1).
    mockedUseSaldoSesionCaja.mockReturnValue({ saldoUsd: 999999, saldoBs: 999999, isLoading: false })
  })

  it('Scenario "Selector muestra saldo por cuenta": cada opcion de cuenta muestra su saldo disponible junto al nombre', () => {
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    const selects = screen.getAllByRole('combobox')
    const cuentaSelect = selects[1]! // [0]=Origen (Tesoreria/Sesion), [1]=cuenta
    expect(cuentaSelect).toHaveTextContent('Banco Mercantil USD')
    expect(cuentaSelect).toHaveTextContent('500.00')
  })

  it('Scenario "Select Origen habilita Tesoreria y Sesion de caja activa, ambas seleccionables" (Slice 3, nc-cuadre-sesion-fase2): ninguna opcion queda deshabilitada ni dice "Proximamente"', () => {
    mockedUseSesionesActivas.mockReturnValue({
      sesiones: [{ id: 'sesion-1', caja_nombre: 'Caja Principal', usuario_apertura_nombre: null } as never],
      isLoading: false,
    })
    render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

    const origenSelect = screen.getAllByRole('combobox')[0]!
    expect(origenSelect).toHaveValue('TESORERIA')

    const opcionTesoreria = screen.getByRole('option', { name: /^Tesoreria$/i })
    expect(opcionTesoreria).toBeEnabled()

    const opcionSesion = screen.getByRole('option', { name: /Caja Principal/i })
    expect(opcionSesion).toBeEnabled()
    expect(opcionSesion).not.toHaveTextContent(/Proximamente/i)
  })

  describe('Ajuste UX post-QA #1 (nc-admin-saldo-disponible-sesion): el nombre del usuario abre-sesion en el label de "Origen"', () => {
    it('con usuario_apertura_nombre resuelto, la opcion de sesion lo incluye junto a caja/id', () => {
      mockedUseSesionesActivas.mockReturnValue({
        sesiones: [
          { id: 'sesion-1', caja_nombre: 'Caja Principal', usuario_apertura_nombre: 'Maria Perez' } as never,
        ],
        isLoading: false,
      })
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      expect(screen.getByRole('option', { name: /Caja Principal — Maria Perez/i })).toBeInTheDocument()
    })

    it('sin usuario_apertura_nombre (null, ej. usuario eliminado), la opcion NO deja un guion colgante', () => {
      mockedUseSesionesActivas.mockReturnValue({
        sesiones: [{ id: 'sesion-1', caja_nombre: 'Caja Principal', usuario_apertura_nombre: null } as never],
        isLoading: false,
      })
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      expect(screen.getByRole('option', { name: /^Sesion Caja Principal$/i })).toBeInTheDocument()
    })
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

  describe('Ajuste UX post-QA #3 (Opcion A, revertido): tope de saldo disponible de CUENTA DE TESORERIA (antes sin validar)', () => {
    it('CAJA_FUERTE: escribir un monto que supera su saldo SE ACEPTA en el input, pero marca aria-invalid, muestra el mensaje y deshabilita Confirmar (es efectivo, no puede quedar negativo)', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={1000} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'caja-1')
      const montoInput = screen.getByLabelText(/^monto$/i)
      await user.type(montoInput, '250') // saldo_actual de caja-1 (CAJA_FUERTE) = 200.00, pendiente NC = 1000

      expect(montoInput).toHaveValue(250) // el input NO rechaza el tecleo, aunque supera el saldo
      expect(montoInput).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText(/excede el saldo disponible de la cuenta de tesoreria/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
    })

    it('safety net: cambiar de Cuenta (a una con MENOS saldo) DESPUES de escribir un monto ya valido bloquea Confirmar y muestra el mensaje de cuenta de tesoreria, sin clampear el valor', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={1000} tasaHistorica={40} onConfirm={vi.fn()} />)

      const cuentaSelect = screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!
      await user.selectOptions(cuentaSelect, 'banco-usd-1') // saldo_actual = 500.00
      const montoInput = screen.getByLabelText(/^monto$/i)
      await user.type(montoInput, '300')
      expect(screen.getByRole('button', { name: /Confirmar/i })).not.toBeDisabled()

      await user.selectOptions(cuentaSelect, 'caja-1') // saldo_actual = 200.00 < 300 ya escrito

      expect(montoInput).toHaveValue(300) // no se clampea el valor ya escrito
      expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
      expect(montoInput).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText(/excede el saldo disponible de la cuenta de tesoreria/i)).toBeInTheDocument()

      // El mensaje vive en una fila de ancho completo debajo de los campos
      // de ESTA linea (Ajuste post-QA screenshot), no pegado al input de
      // Monto — se verifica que ambos comparten el contenedor de la linea
      // (el `<div>` con borde que agrupa Origen/Cuenta/Monto/Referencia).
      const lineaContainer = montoInput.closest('.rounded-lg.border') as HTMLElement
      expect(within(lineaContainer).getByText(/excede el saldo disponible de la cuenta de tesoreria/i)).toBeInTheDocument()
    })
  })

  describe('Fix (nc-admin-saldo-disponible-sesion): BANCO se permite sobregirar — SOLO el efectivo (CAJA_FUERTE/sesion) tiene tope de saldo', () => {
    it('BANCO: escribir un monto MAYOR al saldo_actual del banco se permite (sin tope) — no dispara aria-invalid ni el mensaje de "excede saldo disponible"', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={1000} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      const montoInput = screen.getByLabelText(/^monto$/i)
      await user.type(montoInput, '600') // saldo_actual de banco-usd-1 = 500.00 -> 600 lo supera, y aun asi se permite

      expect(montoInput).toHaveValue(600) // NO se rechaza el keystroke: el banco puede sobregirarse
      expect(montoInput).not.toHaveAttribute('aria-invalid', 'true')
      expect(screen.queryByText(/excede el saldo disponible de la cuenta de tesoreria/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Confirmar/i })).not.toBeDisabled()
    })

    it('BANCO: cambiar de Cuenta (CAJA_FUERTE con monto ya invalido) a un BANCO libera el tope — Confirmar deja de estar bloqueado por saldo de origen', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={1000} tasaHistorica={40} onConfirm={vi.fn()} />)

      const cuentaSelect = screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!
      await user.selectOptions(cuentaSelect, 'caja-1') // saldo_actual = 200.00
      const montoInput = screen.getByLabelText(/^monto$/i)
      await user.type(montoInput, '150')
      expect(screen.getByRole('button', { name: /Confirmar/i })).not.toBeDisabled()

      await user.selectOptions(cuentaSelect, 'banco-usd-1') // saldo_actual = 500.00, sin tope

      expect(montoInput).toHaveValue(150)
      expect(screen.getByRole('button', { name: /Confirmar/i })).not.toBeDisabled()
      expect(montoInput).not.toHaveAttribute('aria-invalid', 'true')
    })

    it('BANCO sigue respetando el TOPE DE PENDIENTE de la NC (montoDisponibleUsd) — el sobregiro solo aplica contra el saldo de la cuenta, no contra el pendiente', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1') // saldo 500, pero pendiente NC = 100
      const montoInput = screen.getByLabelText(/^monto$/i)
      await user.type(montoInput, '101') // 101 > pendiente de 100 (aunque el banco tiene saldo de sobra)

      expect(montoInput).toHaveValue(101) // el input NO rechaza el tecleo
      expect(montoInput).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText(/excede el pendiente por reembolsar/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
    })
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

  describe('Ajuste UX post-QA #3 (revertido): tope de pendiente de la NC via mensaje + boton deshabilitado, input LIBRE (sin rechazo de keystroke)', () => {
    it('el input de Monto ACEPTA un valor que supera el pendiente de la NC — el estado invalido se muestra via aria-invalid + mensaje, y Confirmar se deshabilita', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      const montoInput = screen.getByLabelText(/^monto$/i)
      await user.type(montoInput, '105')

      expect(montoInput).toHaveValue(105) // el input NO rechaza el tecleo, aunque supera el pendiente de 100
      expect(montoInput).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText(/excede el pendiente por reembolsar/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
    })

    it('safety net: si el pendiente de la NC baja (prop montoDisponibleUsd cambia) DESPUES de escribir un monto ya valido, Confirmar se bloquea y el mensaje aparece pegado al input — SIN clampear el valor ya escrito', async () => {
      const user = userEvent.setup()
      const { rerender } = render(
        <RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />
      )

      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'banco-usd-1')
      const montoInput = screen.getByLabelText(/^monto$/i)
      await user.type(montoInput, '80')
      expect(screen.getByRole('button', { name: /Confirmar/i })).not.toBeDisabled()

      rerender(<RefundTesoreriaForm montoDisponibleUsd={50} tasaHistorica={40} onConfirm={vi.fn()} />)

      expect(montoInput).toHaveValue(80) // no se clampea el valor ya escrito
      expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
      expect(montoInput).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText(/excede el pendiente por reembolsar/i)).toBeInTheDocument()

      // El mensaje vive en una fila de ancho completo debajo de los campos
      // de ESTA linea (Ajuste post-QA screenshot), no pegado al input de
      // Monto — se verifica que ambos comparten el contenedor de la linea.
      const lineaContainer = montoInput.closest('.rounded-lg.border') as HTMLElement
      expect(within(lineaContainer).getByText(/excede el pendiente por reembolsar/i)).toBeInTheDocument()
    })
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

  describe('Sesion de caja activa (Slice 3, nc-cuadre-sesion-fase2): habilitada, resuelve metodo EFECTIVO por moneda', () => {
    beforeEach(() => {
      mockedUseSesionesActivas.mockReturnValue({
        sesiones: [{ id: 'sesion-1', caja_nombre: 'Caja Principal' } as never],
        isLoading: false,
      })
    })

    it('elegir "Sesion de caja activa" en Origen muestra "Efectivo USD"/"Efectivo Bs" en Cuenta, solo para metodos EFECTIVO activos', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')

      const cuentaSelect = screen.getAllByRole('combobox')[1]!
      expect(cuentaSelect).toHaveTextContent('Efectivo USD')
      expect(cuentaSelect).toHaveTextContent('Efectivo Bs')
    })

    it('sin metodo EFECTIVO en una moneda, esa opcion no se renderiza en Cuenta', async () => {
      mockedUseMetodosPagoActivos.mockReturnValue({
        metodos: [metodoEfectivo('efectivo-usd-1', 'USD')],
        isLoading: false,
      })
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')

      const cuentaSelect = screen.getAllByRole('combobox')[1]!
      expect(cuentaSelect).toHaveTextContent('Efectivo USD')
      expect(cuentaSelect).not.toHaveTextContent('Efectivo Bs')
    })

    it('confirmar con Origen=Sesion y Cuenta=Efectivo USD invoca onConfirm con una linea destino SESION_CAJA', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

      await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')
      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'efectivo-usd-1')
      await user.type(screen.getByLabelText(/^monto$/i), '100')

      await user.click(screen.getByRole('button', { name: /^Confirmar reembolso$/i }))

      expect(onConfirm).toHaveBeenCalledWith([
        {
          destino: 'SESION_CAJA',
          sesionCajaId: 'sesion-1',
          metodoCobroId: 'efectivo-usd-1',
          moneda: 'USD',
          montoEnMonedaCuenta: '100',
          referencia: undefined,
        },
      ])
    })

    it('confirmar con Cuenta=Efectivo Bs resuelve moneda BS (no se toma de cuentaPorId, que solo conoce cuentas de tesoreria)', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

      await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')
      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'efectivo-bs-1')
      // 4000 Bs / tasaHistorica 40 = 100 USD -> cubre el 100%, remanente 0
      await user.type(screen.getByLabelText(/^monto$/i), '4000')

      await user.click(screen.getByRole('button', { name: /^Confirmar reembolso$/i }))

      expect(onConfirm).toHaveBeenCalledWith([
        {
          destino: 'SESION_CAJA',
          sesionCajaId: 'sesion-1',
          metodoCobroId: 'efectivo-bs-1',
          moneda: 'BS',
          montoEnMonedaCuenta: '4000',
          referencia: undefined,
        },
      ])
    })

    it('cambiar Origen de vuelta a Tesoreria despues de elegir Sesion resetea la Cuenta (no arrastra un metodoCobroId invalido)', async () => {
      const user = userEvent.setup()
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')
      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'efectivo-usd-1')

      await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'TESORERIA')

      const cuentaSelect = screen.getAllByRole('combobox')[1]!
      expect(cuentaSelect).toHaveValue('')
    })

    it('Scenario spec "Sesion pasa a cerrada entre seleccion y confirmacion": si la sesion elegida deja de estar ABIERTA, Confirmar se deshabilita y onConfirm nunca se invoca', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      const { rerender } = render(
        <RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />
      )

      await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')
      await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'efectivo-usd-1')
      await user.type(screen.getByLabelText(/^monto$/i), '100')
      expect(screen.getByRole('button', { name: /^Confirmar reembolso$/i })).not.toBeDisabled()

      // La sesion pasa a CERRADA: la query reactiva de useSesionesActivas ya no la incluye.
      mockedUseSesionesActivas.mockReturnValue({ sesiones: [], isLoading: false })
      rerender(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={onConfirm} />)

      const boton = screen.getByRole('button', { name: /Confirmar/i })
      expect(boton).toBeDisabled()
      await user.click(boton)
      expect(onConfirm).not.toHaveBeenCalled()
    })

    describe('Saldo disponible de sesion (nc-admin-saldo-disponible-sesion): label con saldo + tope de validacion', () => {
      beforeEach(() => {
        mockedUseSaldoSesionCaja.mockReturnValue({ saldoUsd: 500, saldoBs: 500, isLoading: false })
      })

      it('Scenario "Saldo disponible visible": la opcion "Efectivo USD"/"Efectivo Bs" muestra el saldo de la sesion + "disponible" (espejo de Tesoreria)', async () => {
        const user = userEvent.setup()
        render(<RefundTesoreriaForm montoDisponibleUsd={1000} tasaHistorica={40} onConfirm={vi.fn()} />)

        await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')

        const cuentaSelect = screen.getAllByRole('combobox')[1]!
        expect(cuentaSelect).toHaveTextContent('Efectivo USD — $500.00 disponible')
        expect(cuentaSelect).toHaveTextContent('Efectivo Bs — Bs. 500,00 disponible')
      })

      it('bajar el monto al limite exacto del saldo de sesion (monto === saldo) mantiene "Confirmar" habilitado (tope no-estricto)', async () => {
        const user = userEvent.setup()
        render(<RefundTesoreriaForm montoDisponibleUsd={1000} tasaHistorica={40} onConfirm={vi.fn()} />)

        await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')
        await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'efectivo-usd-1')
        await user.type(screen.getByLabelText(/^monto$/i), '500')

        expect(screen.getByRole('button', { name: /Confirmar/i })).not.toBeDisabled()
        expect(screen.queryByText(/excede el saldo disponible de la sesion/i)).not.toBeInTheDocument()
      })

      describe('Ajuste UX post-QA #3 (revertido): tope de saldo de sesion via mensaje + boton deshabilitado, input LIBRE (sin rechazo de keystroke)', () => {
        it('escribir un monto que supera el saldo de sesion SE ACEPTA en el input, pero marca aria-invalid + mensaje y deshabilita Confirmar', async () => {
          const user = userEvent.setup()
          render(<RefundTesoreriaForm montoDisponibleUsd={1000} tasaHistorica={40} onConfirm={vi.fn()} />)

          await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')
          await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'efectivo-usd-1')
          const montoInput = screen.getByLabelText(/^monto$/i)
          await user.type(montoInput, '501') // saldo de sesion = 500

          expect(montoInput).toHaveValue(501) // el input NO rechaza el tecleo
          expect(montoInput).toHaveAttribute('aria-invalid', 'true')
          expect(screen.getByText(/excede el saldo disponible de la sesion/i)).toBeInTheDocument()
          expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
        })

        it('safety net: si el saldo de sesion BAJA (query reactiva) DESPUES de escribir un monto ya valido, Confirmar se bloquea y el mensaje aparece pegado al input — SIN clampear el valor ya escrito', async () => {
          const user = userEvent.setup()
          const { rerender } = render(
            <RefundTesoreriaForm montoDisponibleUsd={1000} tasaHistorica={40} onConfirm={vi.fn()} />
          )

          await user.selectOptions(screen.getAllByLabelText(/origen del reembolso/i)[0]!, 'SESION:sesion-1')
          await user.selectOptions(screen.getAllByLabelText(/cuenta de tesoreria/i)[0]!, 'efectivo-usd-1')
          const montoInput = screen.getByLabelText(/^monto$/i)
          await user.type(montoInput, '300')
          expect(screen.getByRole('button', { name: /Confirmar/i })).not.toBeDisabled()

          mockedUseSaldoSesionCaja.mockReturnValue({ saldoUsd: 200, saldoBs: 200, isLoading: false })
          rerender(<RefundTesoreriaForm montoDisponibleUsd={1000} tasaHistorica={40} onConfirm={vi.fn()} />)

          expect(montoInput).toHaveValue(300) // no se clampea el valor ya escrito
          expect(screen.getByRole('button', { name: /Confirmar/i })).toBeDisabled()
          expect(montoInput).toHaveAttribute('aria-invalid', 'true')
          expect(screen.getByText(/excede el saldo disponible de la sesion/i)).toBeInTheDocument()

          // El mensaje vive en una fila de ancho completo debajo de los
          // campos de ESTA linea (Ajuste post-QA screenshot), no pegado al
          // input de Monto — se verifica que ambos comparten el contenedor
          // de la linea.
          const lineaContainer = montoInput.closest('.rounded-lg.border') as HTMLElement
          expect(within(lineaContainer).getByText(/excede el saldo disponible de la sesion/i)).toBeInTheDocument()
        })
      })
    })
  })

  describe('Restriccion de origenes (Slice 4, unificacion-modal-nc, Design D5): restringirOrigenASesionId + mostrarOrigenTesoreria', () => {
    beforeEach(() => {
      mockedUseSesionesActivas.mockReturnValue({
        sesiones: [
          { id: 'sesion-1', caja_nombre: 'Caja Principal', usuario_apertura_nombre: null } as never,
          { id: 'sesion-2', caja_nombre: 'Caja Secundaria', usuario_apertura_nombre: null } as never,
        ],
        isLoading: false,
      })
    })

    it('con restringirOrigenASesionId, el select Origen SOLO ofrece esa sesion + Tesoreria (mostrarOrigenTesoreria=true default)', () => {
      render(
        <RefundTesoreriaForm
          montoDisponibleUsd={100}
          tasaHistorica={40}
          onConfirm={vi.fn()}
          restringirOrigenASesionId="sesion-1"
        />
      )

      const origenSelect = screen.getAllByRole('combobox')[0]!
      const opciones = within(origenSelect).getAllByRole('option')
      expect(opciones).toHaveLength(2)
      expect(screen.getByRole('option', { name: /^Tesoreria$/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Caja Principal/i })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /Caja Secundaria/i })).not.toBeInTheDocument()
    })

    it('con mostrarOrigenTesoreria=false, la opcion Tesoreria NO aparece en el select Origen', () => {
      render(
        <RefundTesoreriaForm
          montoDisponibleUsd={100}
          tasaHistorica={40}
          onConfirm={vi.fn()}
          restringirOrigenASesionId="sesion-1"
          mostrarOrigenTesoreria={false}
        />
      )

      const origenSelect = screen.getAllByRole('combobox')[0]!
      const opciones = within(origenSelect).getAllByRole('option')
      expect(opciones).toHaveLength(1)
      expect(screen.queryByRole('option', { name: /^Tesoreria$/i })).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Caja Principal/i })).toBeInTheDocument()
    })

    it('con restringirOrigenASesionId, la linea nueva por defecto usa SESION:<id> en vez de TESORERIA', () => {
      render(
        <RefundTesoreriaForm
          montoDisponibleUsd={100}
          tasaHistorica={40}
          onConfirm={vi.fn()}
          restringirOrigenASesionId="sesion-1"
        />
      )

      const origenSelect = screen.getAllByRole('combobox')[0]!
      expect(origenSelect).toHaveValue('SESION:sesion-1')
    })

    it('modo admin (sin props de restriccion) sigue ofreciendo Tesoreria + TODAS las sesiones activas, con TESORERIA como default — sin cambios', () => {
      render(<RefundTesoreriaForm montoDisponibleUsd={100} tasaHistorica={40} onConfirm={vi.fn()} />)

      const origenSelect = screen.getAllByRole('combobox')[0]!
      expect(origenSelect).toHaveValue('TESORERIA')
      const opciones = within(origenSelect).getAllByRole('option')
      expect(opciones).toHaveLength(3) // Tesoreria + sesion-1 + sesion-2
    })
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
