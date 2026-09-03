import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotaCreditoPosModal } from '../nota-credito-pos-modal'
import { crearNotaCredito } from '../../hooks/use-notas-credito'
import { useFacturasSesionActiva } from '../../hooks/use-facturas-sesion-activa'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions } from '@/core/hooks/use-permissions'
import { toast } from 'sonner'
import type { FacturaParaAnular } from '../../hooks/use-notas-credito'
import type { SesionCaja } from '@/features/caja/hooks/use-sesiones-caja'

// PIN A (Spec notas-credito-pos, obs #2835): mockeamos `SupervisorPinDialog`
// para detectar sin ambiguedad si el componente lo abre — mismo patron que
// `crear-ncr-modal.test.tsx`.
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({
  SupervisorPinDialog: ({
    isOpen,
    onAuthorized,
  }: {
    isOpen: boolean
    onAuthorized: (id: string) => void
  }) =>
    isOpen ? (
      <div data-testid="mock-pin-dialog">
        <button onClick={() => onAuthorized('supervisor-1')}>Autorizar</button>
      </div>
    ) : null,
}))

vi.mock('@/features/ventas/hooks/use-notas-credito', () => ({ crearNotaCredito: vi.fn() }))
vi.mock('@/features/ventas/hooks/use-facturas-sesion-activa', () => ({ useFacturasSesionActiva: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/hooks/use-permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/hooks/use-permissions')>()
  return { ...actual, usePermissions: vi.fn() }
})
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedCrearNotaCredito = vi.mocked(crearNotaCredito)
const mockedUseFacturasSesionActiva = vi.mocked(useFacturasSesionActiva)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedToastSuccess = vi.mocked(toast.success)

const sesionActiva: SesionCaja = {
  id: 'sesion-1',
  empresa_id: 'emp-1',
  caja_id: 'caja-1',
  usuario_apertura_id: 'user-1',
  fecha_apertura: '2026-01-01T00:00:00Z',
  monto_apertura_usd: '0',
  monto_apertura_bs: '0',
  usuario_cierre_id: null,
  fecha_cierre: null,
  monto_sistema_usd: null,
  monto_fisico_usd: null,
  diferencia_usd: null,
  monto_sistema_bs: null,
  monto_fisico_bs: null,
  diferencia_bs: null,
  observaciones_cierre: null,
  status: 'ABIERTA',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function facturaSesion(overrides: Partial<FacturaParaAnular> = {}): FacturaParaAnular {
  return {
    id: 'venta-1',
    nro_factura: 'C01-000001',
    cliente_id: 'cli-1',
    cliente_nombre: 'Maria Perez',
    cliente_identificacion: 'V-12345678',
    tasa: '40',
    total_usd: '30.00',
    total_bs: '1200.00',
    saldo_pend_usd: '0.00',
    tipo: 'CONTADO',
    fecha: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function setup(opts: { hasPermission: boolean }) {
  mockedUseFacturasSesionActiva.mockReturnValue({ facturas: [facturaSesion()], isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Cajero', level: 3, rol_id: 'rol-1', rol_nombre: 'Cajero', empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUsePermissions.mockReturnValue({
    hasPermission: () => opts.hasPermission,
    hasAnyPermission: () => opts.hasPermission,
    hasAllPermissions: () => opts.hasPermission,
    isOwner: false,
    rolId: 'rol-1',
    rolNombre: 'Cajero',
    loading: false,
  })
  mockedCrearNotaCredito.mockResolvedValue({ ncrId: 'ncr-1', nroNcr: 'NCR-000001' })
}

async function seleccionarPrimeraFactura() {
  const user = userEvent.setup()
  await user.click(screen.getByText(/C01-000001/i))
  return user
}

describe('NotaCreditoPosModal — Slice 5a-2a (entrada POS, PIN A, TOTAL only, sin coupling con cobro)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista SOLO las facturas de la sesion activa (via useFacturasSesionActiva, query-enforced)', () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText(/C01-000001/i)).toBeInTheDocument()
    expect(mockedUseFacturasSesionActiva).toHaveBeenCalled()
  })

  it('con permiso ventas.nota_credito: confirmar emite directo, SIN pedir PIN', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'POS',
      sesionCajaActivaId: 'sesion-1',
      modalidad: 'EFECTIVO_REAL',
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith(expect.stringContaining('NCR-000001'))
  })

  it('sin permiso ventas.nota_credito: exige PIN de supervisor antes de emitir', async () => {
    setup({ hasPermission: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()

    await user.click(screen.getByText('Autorizar'))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
  })

  it('EFECTIVO_REAL reachable via caller POS real: entryPoint POS + sesion activa + modalidad EFECTIVO_REAL (dispara la Regla de Oro dentro de crearNotaCredito)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      entryPoint: 'POS',
      modalidad: 'EFECTIVO_REAL',
    })
    expect(mockedCrearNotaCredito.mock.calls[0][0].tipo).toBeUndefined()
  })

  it('REGRESION obs #2814 reachable via caller POS real: SALDO_FAVOR (no-efectivo) se pasa correctamente a crearNotaCredito (la Regla de Oro no dispara dentro de la funcion)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.selectOptions(screen.getByRole('combobox'), 'SALDO_FAVOR')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      entryPoint: 'POS',
      modalidad: 'SALDO_FAVOR',
    })
  })

  it('NUNCA pasa depositoReingresoId (POS-express usa el riel automatico en este slice — override es PIN B, Slice 5a-2b)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].depositoReingresoId).toBeUndefined()
  })
})
