import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CobroModal } from '../cobro-modal'
import { validarStockServidor } from '../../hooks/use-ventas'
import { useFacturasPendientes } from '@/features/cxc/hooks/use-cxc'
import { useDeudaFacturasCliente } from '@/features/cxc/hooks/use-deuda-cliente'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'
import { useIgtfConfig } from '@/features/configuracion/hooks/use-igtf-config'
import type { CobroModalProps } from '../cobro-modal'

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
})
