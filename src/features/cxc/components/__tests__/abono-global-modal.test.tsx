import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AbonoGlobalModal } from '../abono-global-modal'
import { useFacturasPendientes } from '../../hooks/use-cxc'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useMetodosCxC } from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'

/**
 * PR-B (sdd/saf-snapshot-y-trazabilidad/tasks-b22-dual-input, #5270):
 * primer test de `AbonoGlobalModal` — enfocado SOLO en el wiring del input
 * dual SAF (`SafMontoDualInput`, PR-A1) y el AND de `safEstado==='ok'` en el
 * gate de "Abonar"/"Aplicar SAF". Mismo criterio que `cobro-modal.test.tsx`
 * (PR-A2): se mockean los hooks PowerSync y el modulo `db` en el boundary
 * para poder renderizar sin Worker real.
 */
vi.mock('../../hooks/use-cxc', () => ({
  useFacturasPendientes: vi.fn(),
  registrarAbonoGlobal: vi.fn(),
  registrarDiscrepanciaCxC: vi.fn(),
}))
vi.mock('@/core/hooks/use-saldo-a-favor', () => ({ useSaldoAFavor: vi.fn() }))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))
vi.mock('@/features/configuracion/hooks/use-payment-methods', () => ({ useMetodosCxC: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/db/powersync/db', () => ({
  db: { execute: vi.fn(() => Promise.resolve({ rows: { item: () => undefined } })) },
}))

const mockedUseFacturasPendientes = vi.mocked(useFacturasPendientes)
const mockedUseSaldoAFavor = vi.mocked(useSaldoAFavor)
const mockedUseTasaActual = vi.mocked(useTasaActual)
const mockedUseMetodosCxC = vi.mocked(useMetodosCxC)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

function baseProps(overrides: Partial<Parameters<typeof AbonoGlobalModal>[0]> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    clienteId: 'cliente-1',
    clienteNombre: 'Juan Perez',
    saldoActual: 1000,
    onSuccess: vi.fn(),
    ...overrides,
  }
}

async function activarSaf(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/Usar saldo a favor/i))
}

describe('AbonoGlobalModal — SAF dual input (PR-B, sdd/saf-snapshot-y-trazabilidad)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseFacturasPendientes.mockReturnValue({ facturas: [], isLoading: false })
    mockedUseTasaActual.mockReturnValue({ tasaValor: 40, isLoading: false } as ReturnType<typeof useTasaActual>)
    mockedUseMetodosCxC.mockReturnValue({ metodos: [], isLoading: false } as ReturnType<typeof useMetodosCxC>)
    mockedUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'a@a.com', nombre: 'Tester', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'empresa-1' },
      loading: false,
    })
  })

  it('tipear un monto SAF que excede el disponible marca aria-invalid, muestra el mensaje distintivo y deshabilita el submit', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 30, tieneSaf: true })
    const user = userEvent.setup()
    render(<AbonoGlobalModal {...baseProps({ saldoActual: 1000 })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '50')

    expect(safUsdInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/excede el saldo a favor disponible/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abonar|Aplicar SAF/i })).toBeDisabled()
  })

  it('tipear un monto SAF que excede el total a pagar marca aria-invalid con un mensaje DISTINTO y deshabilita el submit', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 200, tieneSaf: true })
    const user = userEvent.setup()
    render(<AbonoGlobalModal {...baseProps({ saldoActual: 100 })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '150')

    expect(safUsdInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/excede el total a pagar/i)).toBeInTheDocument()
    expect(screen.queryByText(/excede el saldo a favor disponible/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abonar|Aplicar SAF/i })).toBeDisabled()
  })

  it('un monto SAF valido (dentro de ambos topes) no muestra warning y habilita el submit', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 200, tieneSaf: true })
    const user = userEvent.setup()
    render(<AbonoGlobalModal {...baseProps({ saldoActual: 100 })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '50')

    expect(safUsdInput).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/excede/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abonar|Aplicar SAF/i })).not.toBeDisabled()
  })

  it('un monto SAF igual al 100% del disponible y del total (boundary) no muestra warning y habilita el submit — no regresion del fix PR11 (SAF-only payment)', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 100, tieneSaf: true })
    const user = userEvent.setup()
    render(<AbonoGlobalModal {...baseProps({ saldoActual: 100 })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)

    // El checkbox pre-carga min(disponible, saldoActual) = 100, que YA es el
    // 100% de ambos topes — se reafirma explicitamente el valor para que el
    // test no dependa del pre-cargado implicito.
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '100')

    expect(safUsdInput).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/excede/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Abonar|Aplicar SAF/i })).not.toBeDisabled()
  })

  it('editar el campo Bs recalcula el companero USD sin perder precision (bidireccional)', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 100, tieneSaf: true })
    const user = userEvent.setup()
    render(<AbonoGlobalModal {...baseProps({ saldoActual: 100 })} />)

    await activarSaf(user)
    const safBsInput = screen.getByLabelText(/Monto SAF \(Bs\)/i)
    await user.clear(safBsInput)
    await user.type(safBsInput, '2000') // 2000 Bs / tasa 40 = 50 USD exactos

    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    expect(safUsdInput).toHaveValue('50')
  })
})
