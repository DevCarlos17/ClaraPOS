import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PagoFacturaModal } from '../pago-factura-modal'
import type { VentaPendiente } from '../../hooks/use-cxc'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useMetodosCxC } from '@/features/configuracion/hooks/use-payment-methods'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { db } from '@/core/db/powersync/db'

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

  it('cuando NO hay tasa registrada para la fecha pero existe tasa vigente, el campo "Tasa de cobro" hace fallback a la vigente (no se congela en 0) y el recalculo SAF USD→Bs funciona — bugfix engram #5292', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 200, tieneSaf: true })
    mockedUseTasaActual.mockReturnValue({ tasaValor: 40, isLoading: false } as ReturnType<typeof useTasaActual>)
    // Sobreescribe el mock compartido del archivo (que devuelve `{ valor: '40' }`
    // para TODA query) solo para esta prueba: la 1ra llamada (sesiones_caja) y la
    // 2da (tasas_cambio) devuelven AMBAS sin fila — reproduce "sin sesion activa" +
    // "sin tasa registrada para la fecha", el escenario exacto de QA staging.
    const sinFila = { rows: { _array: [], length: 0, item: () => undefined }, rowsAffected: 0 }
    vi.mocked(db.execute)
      .mockImplementationOnce(() => Promise.resolve(sinFila))
      .mockImplementationOnce(() => Promise.resolve(sinFila))

    const user = userEvent.setup()
    render(<PagoFacturaModal {...baseProps({ factura: makeFactura(100) })} />)

    const tasaInput = screen.getByPlaceholderText('0.0000')
    // Antes del fix, tasaStr queda en '' (tasaNum=0) porque no hay tasa de
    // fecha registrada y no se hace fallback a la vigente — el guard de
    // `saf-monto-dual-input.tsx:66/73` congela el recalculo con tasa<=0.
    await waitFor(() => expect(tasaInput).toHaveValue(40))

    await activarSaf(user)
    const safUsdInput = screen.getByLabelText(/Monto SAF \(USD\)/i)
    await user.clear(safUsdInput)
    await user.type(safUsdInput, '50')

    const safBsInput = screen.getByLabelText(/Monto SAF \(Bs\)/i)
    // 50 USD a la tasa vigente (40) = 2000.00 Bs — con el bug queda "0.00"
    // porque el componente recibe tasa=0.
    expect(safBsInput).toHaveValue('2000.00')
  })

  it('la tasa de cobro se precarga de nuevo al cerrar y reabrir el modal el mismo dia (bugfix engram #5296, bug A)', async () => {
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 200, tieneSaf: true })
    const user = userEvent.setup()
    const { rerender } = render(<PagoFacturaModal {...baseProps({ factura: makeFactura(100) })} />)

    const tasaInput = screen.getByPlaceholderText('0.0000')
    // Primera apertura: la tasa se precarga correctamente (mock db.execute
    // devuelve `{ valor: '40' }` para la query de tasas_cambio).
    await waitFor(() => expect(tasaInput).toHaveValue(40))

    // Usuario cierra el modal via "Cancelar" -> handleClose() resetea
    // tasaStr a '' internamente y notifica al padre via onClose.
    await user.click(screen.getByRole('button', { name: /Cancelar/i }))

    // El padre reacciona a onClose cerrando el modal (isOpen=false)...
    rerender(<PagoFacturaModal {...baseProps({ factura: makeFactura(100) })} isOpen={false} />)
    // ...y el usuario lo reabre el MISMO dia (fechaPago no cambia de valor).
    rerender(<PagoFacturaModal {...baseProps({ factura: makeFactura(100) })} isOpen={true} />)

    // Antes del fix: el efecto que carga `tasaStr` depende de `fechaPago`
    // (no de `isOpen`); como `fechaPago` sigue siendo "hoy" en el reopen,
    // el efecto no se re-ejecuta y `tasaStr` queda en '' (dejado por
    // handleClose) -> el input de tasa queda vacio tras reabrir.
    const tasaInputReabierto = screen.getByPlaceholderText('0.0000')
    await waitFor(() => expect(tasaInputReabierto).toHaveValue(40))
  })
})
