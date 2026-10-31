import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CobroModal } from '../cobro-modal'
import { validarStockServidor } from '../../hooks/use-ventas'
import { useFacturasPendientes } from '@/features/cxc/hooks/use-cxc'
import { useDeudaFacturasCliente } from '@/features/cxc/hooks/use-deuda-cliente'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'
import { useIgtfConfig } from '@/features/configuracion/hooks/use-igtf-config'
import type { CobroModalProps } from '../cobro-modal'
import type { PaymentMethod } from '@/features/configuracion/hooks/use-payment-methods'

/**
 * PR-A2 (sdd/saf-snapshot-y-trazabilidad/tasks-b22-dual-input, #5270):
 * primer test de `CobroModal` — enfocado SOLO en el wiring del input dual
 * SAF (`SafMontoDualInput`, PR-A1) y el AND de `estado==='ok'` en el gate
 * de "Procesar". El resto de hooks consultados por este modal usan
 * PowerSync (`useQuery`) — se mockean en el boundary (mismo criterio que
 * `nota-credito-pos-modal.test.tsx`) para poder renderizar sin Worker real.
 */
vi.mock('../../hooks/use-ventas', () => ({
  crearVenta: vi.fn(),
  validarStockServidor: vi.fn(),
}))
vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  useFacturasPendientes: vi.fn(),
}))
vi.mock('@/features/cxc/hooks/use-deuda-cliente', () => ({
  useDeudaFacturasCliente: vi.fn(),
}))
vi.mock('@/core/hooks/use-saldo-a-favor', () => ({
  useSaldoAFavor: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-igtf-config', () => ({
  useIgtfConfig: vi.fn(),
}))
// SupervisorPinDialog usa `usePowerSync()` internamente — fuera de alcance
// de este test (ninguno de los escenarios SAF involucra ABSORBER).
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({
  SupervisorPinDialog: () => null,
}))

const mockedUseFacturasPendientes = vi.mocked(useFacturasPendientes)
const mockedUseDeudaFacturasCliente = vi.mocked(useDeudaFacturasCliente)
const mockedUseSaldoAFavor = vi.mocked(useSaldoAFavor)
const mockedUseIgtfConfig = vi.mocked(useIgtfConfig)
const mockedValidarStockServidor = vi.mocked(validarStockServidor)

function baseProps(overrides: Partial<CobroModalProps> = {}): CobroModalProps {
  return {
    isOpen: true,
    onClose: vi.fn(),
    tasa: 40,
    totalBrutoUsd: 100,
    descuentoBs: 0,
    descuentoMotivo: '',
    clienteId: 'cliente-1',
    clienteNombre: 'Juan Perez',
    clienteData: null,
    lineas: [],
    cargosEspeciales: [],
    sesionCajaId: 'sesion-1',
    usuarioId: 'user-1',
    empresaId: 'empresa-1',
    metodos: [],
    depositoId: null,
    onSuccess: vi.fn(),
    ...overrides,
  }
}

async function activarSaf(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/Saldo a favor/i))
}

function makeMetodoEfectivo(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: 'metodo-efectivo',
    nombre: 'Efectivo',
    tipo: 'EFECTIVO',
    moneda_id: 'moneda-usd',
    moneda: 'USD',
    banco_empresa_id: null,
    banco_nombre: null,
    caja_fuerte_id: null,
    caja_nombre: null,
    requiere_referencia: 0,
    saldo_actual: '0',
    is_active: 1,
    empresa_id: 'empresa-1',
    created_at: '2026-01-01T00:00:00Z',
    deposito_directo: 0,
    comision_pct: '0',
    usa_pos: 1,
    usa_cxc: 0,
    usa_cxp: 0,
    consolidar_lotes: 0,
    ...overrides,
  }
}

describe('CobroModal — SAF dual input (PR-A2, sdd/saf-snapshot-y-trazabilidad)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseFacturasPendientes.mockReturnValue({ facturas: [], isLoading: false })
    mockedUseDeudaFacturasCliente.mockReturnValue({ deudaFacturasUsd: 0, isLoading: false })
    mockedUseIgtfConfig.mockReturnValue({ aplicaIgtf: false, tasaIgtf: 3, isLoading: false })
    mockedValidarStockServidor.mockResolvedValue(undefined)
  })

  it('tipear un monto SAF que excede el disponible marca aria-invalid, muestra el mensaje distintivo y deshabilita Procesar', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 30, tieneSaf: true })
    const user = userEvent.setup()
    render(<CobroModal {...baseProps()} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '50')

    expect(safUsdInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/excede el saldo a favor disponible/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procesar/i })).toBeDisabled()
  })

  it('tipear un monto SAF que excede el total a pagar marca aria-invalid con un mensaje DISTINTO y deshabilita Procesar', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 200, tieneSaf: true })
    const user = userEvent.setup()
    render(<CobroModal {...baseProps()} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '150')

    expect(safUsdInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/excede el total a pagar/i)).toBeInTheDocument()
    expect(screen.queryByText(/excede el saldo a favor disponible/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procesar/i })).toBeDisabled()
  })

  it('un monto SAF igual al 100% del disponible y del total (boundary) no muestra warning y habilita Procesar — no regresion del fix PR11 (SAF-only payment)', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 100, tieneSaf: true })
    const user = userEvent.setup()
    render(<CobroModal {...baseProps()} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)

    // El checkbox pre-carga min(disponible, total) = 100, que YA es el 100%
    // de ambos topes — se reafirma explicitamente el valor para que el test
    // no dependa del pre-cargado implicito.
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '100')

    expect(safUsdInput).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/excede/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procesar/i })).not.toBeDisabled()
  })

  it('editar el campo Bs recalcula el companero USD sin perder precision (bidireccional)', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 100, tieneSaf: true })
    const user = userEvent.setup()
    render(<CobroModal {...baseProps()} />)

    await activarSaf(user)
    const safBsInput = screen.getByLabelText(/Monto SAF \(Bs\)/i)
    await user.clear(safBsInput)
    await user.type(safBsInput, '2000') // 2000 Bs / tasa 40 = 50 USD exactos

    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    expect(safUsdInput).toHaveValue('50')
  })

  it('SAF que excede el total a pagar (dentro del disponible) bloquea Procesar y NO muestra los controles de excedente (Dar vuelto/Saldo a favor/Propina) — cierra gap safEstado en ramas overpago (engram #5293)', async () => {
    // Total factura $1.30 (tasa 40 => Bs 52). SAF disponible $1.70 (no excede
    // disponible) pero se tipea $1.50 (SI excede el total de $1.30) — el
    // mismo monto en Bs (60) ya supera el total (52) y dispara `estaOverpago`
    // SIN que el cajero haya agregado ningun pago en efectivo todavia.
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 1.7, tieneSaf: true })
    const metodoEfectivo = makeMetodoEfectivo()
    const user = userEvent.setup()
    render(<CobroModal {...baseProps({ totalBrutoUsd: 1.3, metodos: [metodoEfectivo] })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '1.50')

    // El warning propio de SafMontoDualInput (evaluarSafMonto) esta visible
    expect(screen.getByText(/excede el total a pagar/i)).toBeInTheDocument()

    // BUG LATENTE (#5293): si ADEMAS el cajero agrega un pago en efectivo,
    // `puedeProcesar` en la rama `estaOverpago && discrepancyMode==='VUELTO'`
    // (auto-seleccionado por el efecto de discrepancia) NO verificaba
    // `safEstado`, habilitando "Procesar" pese al SAF invalido.
    await user.selectOptions(screen.getByRole('combobox'), metodoEfectivo.id)
    const montoInput = screen.getByPlaceholderText(/Monto \(USD\)/i)
    await user.type(montoInput, '5{Enter}')

    // Los controles de excedente (Dar vuelto / Saldo a favor / Propina) NO
    // deben renderizarse cuando el excedente proviene de un SAF invalido.
    expect(screen.queryByRole('button', { name: /Dar vuelto/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Saldo a favor$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Propina$/i })).not.toBeInTheDocument()

    // Procesar debe quedar bloqueado
    expect(screen.getByRole('button', { name: /Procesar/i })).toBeDisabled()
  })

  it('destildar SAF luego de un monto invalido resetea safEstado y no bloquea un sobrepago en efectivo genuino (regresion engram #5294) — ajustado a sdd/pos-excedente-vuelto-validacion: sin auto-seleccion, requiere elegir "Dar vuelto" + distribuir', async () => {
    // Mismo escenario que el test anterior ($1.30 total, SAF disponible
    // $1.70, SAF tipeado $1.50 que excede el total) pero el cajero
    // DESTILDA "Saldo a favor" antes de agregar el pago en efectivo. El
    // excedente resultante es un sobrepago en efectivo 100% genuino, sin
    // relacion alguna con SAF — no debe quedar bloqueado por un
    // `safEstado` obsoleto que nunca se reseteo al desmarcar el checkbox.
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 1.7, tieneSaf: true })
    const metodoEfectivo = makeMetodoEfectivo()
    const user = userEvent.setup()
    render(<CobroModal {...baseProps({ totalBrutoUsd: 1.3, metodos: [metodoEfectivo] })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '1.50')
    expect(screen.getByText(/excede el total a pagar/i)).toBeInTheDocument()

    // Destildar SAF — el cajero decide no usarlo.
    await user.click(screen.getByLabelText(/Saldo a favor/i))
    expect(screen.queryByLabelText(/Monto SAF \(USD\)/i)).not.toBeInTheDocument()

    // Pago en efectivo que genuinamente sobrepaga el total (sin SAF).
    await user.selectOptions(screen.getByRole('combobox'), metodoEfectivo.id)
    const montoInput = screen.getByPlaceholderText(/Monto \(USD\)/i)
    await user.type(montoInput, '5{Enter}')

    // Los controles de excedente deben aparecer (sobrepago legitimo) — pero
    // NINGUN modo queda pre-seleccionado (fix pos-excedente-vuelto-validacion):
    // `safEstado` ya NO esta bloqueando nada (quedo en 'ok' tras destildar), y
    // Procesar sigue bloqueado hasta que el cajero elija explicitamente.
    expect(screen.getByRole('button', { name: /Dar vuelto/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procesar/i })).toBeDisabled()

    // El cajero elige "Dar vuelto" explicitamente — el AND-gate `safEstado`
    // sigue sin bloquear (era el bug original #5293/#5294), pero ahora
    // ademas se exige distribuir el vuelto antes de habilitar Procesar.
    await user.click(screen.getByRole('button', { name: /Dar vuelto/i }))
    expect(screen.getByRole('button', { name: /Procesar/i })).toBeDisabled()

    const splitInput = screen.getByPlaceholderText('0.00')
    await user.type(splitInput, '5')
    expect(screen.getByRole('button', { name: /Procesar/i })).not.toBeDisabled()
  })
})

describe('CobroModal — gating de excedente sin auto-seleccion (sdd/pos-excedente-vuelto-validacion)', () => {
  function metodoEfectivoBs(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
    return makeMetodoEfectivo({
      id: 'metodo-efectivo-bs',
      nombre: 'Efectivo Bs',
      moneda: 'BS',
      moneda_id: 'moneda-bs',
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseFacturasPendientes.mockReturnValue({ facturas: [], isLoading: false })
    mockedUseDeudaFacturasCliente.mockReturnValue({ deudaFacturasUsd: 0, isLoading: false })
    mockedUseIgtfConfig.mockReturnValue({ aplicaIgtf: false, tasaIgtf: 3, isLoading: false })
    mockedValidarStockServidor.mockResolvedValue(undefined)
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 0, tieneSaf: false })
  })

  /** Total $10 a tasa 40 = Bs 400. Pago Bs 440 -> excedente ideal Bs 40 ($1). */
  async function generarExcedente(user: ReturnType<typeof userEvent.setup>, metodo: PaymentMethod) {
    render(<CobroModal {...baseProps({ totalBrutoUsd: 10, metodos: [metodo] })} />)
    await user.selectOptions(screen.getByRole('combobox'), metodo.id)
    const montoInput = screen.getByPlaceholderText(/Monto \(BS\)/i)
    await user.type(montoInput, '440{Enter}')
  }

  it('excedente detectado sin pago previo de discrepancyMode: ningun modo queda pre-seleccionado y Procesar queda bloqueado', async () => {
    const metodo = metodoEfectivoBs()
    const user = userEvent.setup()
    await generarExcedente(user, metodo)

    // El panel "Desglose de vuelto" solo se renderiza con discrepancyMode==='VUELTO'.
    // Que NO aparezca prueba que no hubo auto-seleccion.
    expect(screen.queryByText(/Desglose de vuelto/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procesar/i })).toBeDisabled()
  })

  it('"Dar vuelto" elegido pero sin distribuir ningun monto: Procesar sigue bloqueado', async () => {
    const metodo = metodoEfectivoBs()
    const user = userEvent.setup()
    await generarExcedente(user, metodo)

    await user.click(screen.getByRole('button', { name: /Dar vuelto/i }))

    expect(screen.getByRole('button', { name: /Procesar/i })).toBeDisabled()
  })

  it('una sola entrada no vacia (aunque no matchee el excedente ideal) habilita Procesar', async () => {
    const metodo = metodoEfectivoBs()
    const user = userEvent.setup()
    await generarExcedente(user, metodo)

    await user.click(screen.getByRole('button', { name: /Dar vuelto/i }))
    const splitInput = screen.getByPlaceholderText('0.00')
    await user.type(splitInput, '5')

    expect(screen.getByRole('button', { name: /Procesar/i })).not.toBeDisabled()
  })

  it('distribuido MENOS que el ideal (Bs 10 de Bs 40): muestra mensaje de sobrante de caja y Procesar sigue habilitado', async () => {
    const metodo = metodoEfectivoBs()
    const user = userEvent.setup()
    await generarExcedente(user, metodo)

    await user.click(screen.getByRole('button', { name: /Dar vuelto/i }))
    const splitInput = screen.getByPlaceholderText('0.00')
    await user.type(splitInput, '10')

    expect(screen.getByText(/sobrante de caja/i)).toBeInTheDocument()
    expect(screen.queryByText(/faltante de caja/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procesar/i })).not.toBeDisabled()
  })

  it('distribuido MAS que el ideal (Bs 50 de Bs 40): muestra mensaje de faltante de caja y Procesar sigue habilitado', async () => {
    const metodo = metodoEfectivoBs()
    const user = userEvent.setup()
    await generarExcedente(user, metodo)

    await user.click(screen.getByRole('button', { name: /Dar vuelto/i }))
    const splitInput = screen.getByPlaceholderText('0.00')
    await user.type(splitInput, '50')

    expect(screen.getByText(/faltante de caja/i)).toBeInTheDocument()
    expect(screen.queryByText(/sobrante de caja/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procesar/i })).not.toBeDisabled()
  })

  it('distribuido EXACTAMENTE igual al ideal (Bs 40): no muestra mensaje de sobrante/faltante, Procesar habilitado', async () => {
    const metodo = metodoEfectivoBs()
    const user = userEvent.setup()
    await generarExcedente(user, metodo)

    await user.click(screen.getByRole('button', { name: /Dar vuelto/i }))
    const splitInput = screen.getByPlaceholderText('0.00')
    await user.type(splitInput, '40')

    expect(screen.queryByText(/sobrante de caja/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/faltante de caja/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Procesar/i })).not.toBeDisabled()
  })
})
