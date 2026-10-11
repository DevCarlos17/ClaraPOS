import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PagoFacturaModal } from '../pago-factura-modal'
import type { VentaPendiente } from '../../hooks/use-cxc'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useMetodosCxC } from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'

/**
 * PR-C (sdd/saf-snapshot-y-trazabilidad/tasks-b22-dual-input, #5270):
 * primer test de `PagoFacturaModal` — enfocado SOLO en el wiring del input
 * dual SAF (`SafMontoDualInput`, PR-A1) y el AND de `safEstado==='ok'` en el
 * gate de "Pagar". Mismo criterio que `abono-global-modal.test.tsx` (PR-B):
 * se mockean los hooks PowerSync y el modulo `db` en el boundary para poder
 * renderizar sin Worker real.
 */
vi.mock('../../hooks/use-cxc', () => ({
  registrarPagoFactura: vi.fn(),
  registrarAbonoPrestamo: vi.fn(),
  registrarDiscrepanciaCxC: vi.fn(),
  registrarSafExcedente: vi.fn(),
  registrarDiferencialCxC: vi.fn(),
}))
vi.mock('@/core/hooks/use-saldo-a-favor', () => ({ useSaldoAFavor: vi.fn() }))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))
vi.mock('@/features/configuracion/hooks/use-payment-methods', () => ({ useMetodosCxC: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/db/powersync/db', () => ({
  // Una sola fila compartida por ambas queries (sesiones_caja / tasas_cambio)
  // — igual que abono-global-modal.test.tsx: `valor` alimenta tasaInternaNum
  // (tasa auto-cargada, necesaria para que `canSubmit` no bloquee por
  // `tasaNum <= 0`); `id`/`fecha_apertura` quedan undefined (sin sesion
  // activa), lo cual es un estado valido (destino cae a TESORERIA).
  db: { execute: vi.fn(() => Promise.resolve({ rows: { item: () => ({ valor: '40' }) } })) },
}))

const mockedUseSaldoAFavor = vi.mocked(useSaldoAFavor)
const mockedUseTasaActual = vi.mocked(useTasaActual)
const mockedUseMetodosCxC = vi.mocked(useMetodosCxC)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

function makeFactura(saldoPendUsd: number): VentaPendiente {
  return {
    id: 'venta-1',
    nro_factura: '0001',
    fecha: '2026-01-01',
    total_usd: String(saldoPendUsd),
    total_bs: String(saldoPendUsd * 40),
    saldo_pend_usd: String(saldoPendUsd),
    tasa: '40',
    tipo: 'FACTURA',
    cliente_id: 'cliente-1',
  }
}

function baseProps(overrides: Partial<Parameters<typeof PagoFacturaModal>[0]> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    factura: makeFactura(1000),
    clienteId: 'cliente-1',
    clienteNombre: 'Juan Perez',
    onSuccess: vi.fn(),
    vencimientos: [],
    ...overrides,
  }
}

async function activarSaf(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/Usar saldo a favor/i))
}

/** El submit es distinto del link "Pagar total" (ambos empiezan con "Pagar") — se distingue por el signo $ del monto renderizado. */
function getSubmitButton() {
  return screen.getByRole('button', { name: /^Pagar \$/i })
}

describe('PagoFacturaModal — SAF dual input (PR-C, sdd/saf-snapshot-y-trazabilidad)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    render(<PagoFacturaModal {...baseProps({ factura: makeFactura(1000) })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '50')

    expect(safUsdInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/excede el saldo a favor disponible/i)).toBeInTheDocument()
    expect(getSubmitButton()).toBeDisabled()
  })

  it('tipear un monto SAF que excede el total a pagar (saldo de la factura) marca aria-invalid con un mensaje DISTINTO y deshabilita el submit', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 200, tieneSaf: true })
    const user = userEvent.setup()
    render(<PagoFacturaModal {...baseProps({ factura: makeFactura(100) })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '150')

    expect(safUsdInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/excede el total a pagar/i)).toBeInTheDocument()
    expect(screen.queryByText(/excede el saldo a favor disponible/i)).not.toBeInTheDocument()
    expect(getSubmitButton()).toBeDisabled()
  })

  it('un monto SAF valido (dentro de ambos topes) no muestra warning y habilita el submit', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 200, tieneSaf: true })
    const user = userEvent.setup()
    render(<PagoFacturaModal {...baseProps({ factura: makeFactura(100) })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '50')

    expect(safUsdInput).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/excede/i)).not.toBeInTheDocument()
    expect(getSubmitButton()).not.toBeDisabled()
  })

  it('un monto SAF igual al 100% del disponible y del saldo de la factura (boundary) no muestra warning y habilita el submit — no regresion del fix PR11 (SAF-only payment)', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 100, tieneSaf: true })
    const user = userEvent.setup()
    render(<PagoFacturaModal {...baseProps({ factura: makeFactura(100) })} />)

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)

    // El checkbox pre-carga min(disponible, saldoEfectivo) = 100, que YA es el
    // 100% de ambos topes — se reafirma explicitamente el valor para que el
    // test no dependa del pre-cargado implicito.
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '100')

    expect(safUsdInput).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/excede/i)).not.toBeInTheDocument()
    expect(getSubmitButton()).not.toBeDisabled()
  })

  it('editar el campo Bs recalcula el companero USD sin perder precision (bidireccional)', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 100, tieneSaf: true })
    const user = userEvent.setup()
    render(<PagoFacturaModal {...baseProps({ factura: makeFactura(100) })} />)

    await activarSaf(user)
    const safBsInput = screen.getByLabelText(/Monto SAF \(Bs\)/i)
    await user.clear(safBsInput)
    await user.type(safBsInput, '2000') // 2000 Bs / tasa 40 = 50 USD exactos

    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    expect(safUsdInput).toHaveValue('50')
  })
})
