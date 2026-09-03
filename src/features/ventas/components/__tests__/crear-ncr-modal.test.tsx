import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CrearNcrModal } from '../crear-ncr-modal'
import { useDetalleFactura, crearNotaCredito, type FacturaParaAnular } from '../../hooks/use-notas-credito'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions } from '@/core/hooks/use-permissions'
import { useDepositosVentaActivos, type Deposito } from '@/features/inventario/hooks/use-depositos'
import { toast } from 'sonner'

// Corrección obs #2835 (regla PIN definitiva): la pantalla Tradicional dedicada
// NUNCA pide PIN — ya está protegida a nivel de acceso a la ruta. El PIN
// transaccional por-falta-de-permiso es exclusivo del entry point POS (Slice
// 5a-2). Mockeamos `SupervisorPinDialog` para detectar, sin ambigüedad, si el
// componente todavía intenta abrir un dialogo de PIN.
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({
  SupervisorPinDialog: ({ isOpen, titulo }: { isOpen: boolean; titulo?: string }) =>
    isOpen ? <div data-testid="mock-pin-dialog">{titulo ?? 'PIN de supervisor'}</div> : null,
}))

vi.mock('@/features/ventas/hooks/use-notas-credito', () => ({
  useDetalleFactura: vi.fn(),
  crearNotaCredito: vi.fn(),
}))

vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

vi.mock('@/core/hooks/use-permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/hooks/use-permissions')>()
  return { ...actual, usePermissions: vi.fn() }
})

vi.mock('@/features/inventario/hooks/use-depositos', () => ({ useDepositosVentaActivos: vi.fn() }))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedUseDetalleFactura = vi.mocked(useDetalleFactura)
const mockedCrearNotaCredito = vi.mocked(crearNotaCredito)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedUseDepositosVentaActivos = vi.mocked(useDepositosVentaActivos)
const mockedToastSuccess = vi.mocked(toast.success)

function baseFactura(overrides: Partial<FacturaParaAnular> = {}): FacturaParaAnular {
  return {
    id: 'venta-1',
    nro_factura: 'FAC-000123',
    cliente_id: 'cli-1',
    cliente_nombre: 'Maria Perez',
    cliente_identificacion: 'V-12345678',
    tasa: '500',
    total_usd: '10.00',
    total_bs: '5000.00',
    saldo_pend_usd: '0.00',
    tipo: 'CONTADO',
    fecha: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function baseDepositos(): Deposito[] {
  return [
    {
      id: 'dep-1', empresa_id: 'emp-1', nombre: 'Principal', direccion: null,
      es_principal: 1, permite_venta: 1, is_active: 1,
      created_at: '2026-01-01', updated_at: '2026-01-01', created_by: null, updated_by: null,
    },
    {
      id: 'dep-2', empresa_id: 'emp-1', nombre: 'Sucursal', direccion: null,
      es_principal: 0, permite_venta: 1, is_active: 1,
      created_at: '2026-01-01', updated_at: '2026-01-01', created_by: null, updated_by: null,
    },
  ]
}

describe('CrearNcrModal (Tradicional) — sin PIN, selector de deposito libre (obs #2835)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseDetalleFactura.mockReturnValue({ detalles: [], pagos: [], isLoading: false })
    mockedUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'a@a.com', nombre: 'Admin', level: 3, rol_id: 'rol-1', rol_nombre: 'Cajero', empresa_id: 'emp-1' },
      loading: false,
    })
    // Deliberadamente SIN permiso `ventas.nota_credito` — con la regla vieja
    // (Slice 5a) esto hubiera forzado el PIN A de emision. Con la regla
    // definitiva (#2835), el permiso ya no es relevante para este modal.
    mockedUsePermissions.mockReturnValue({
      hasPermission: () => false,
      hasAnyPermission: () => false,
      hasAllPermissions: () => false,
      isOwner: false,
      rolId: 'rol-1',
      rolNombre: 'Cajero',
      loading: false,
    })
    mockedUseDepositosVentaActivos.mockReturnValue({ depositos: baseDepositos(), isLoading: false })
    mockedCrearNotaCredito.mockResolvedValue({ ncrId: 'ncr-1', nroNcr: 'NCR-000001' })
  })

  it('nunca abre un dialogo de PIN de supervisor, ni al confirmar', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()
  })

  it('confirmar emite la NC directamente, sin autorizacion previa', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'TRADICIONAL',
      modalidad: 'AJUSTE_CXC',
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith(expect.stringContaining('NCR-000001'))
  })

  it('el selector de deposito esta desbloqueado desde el inicio, sin boton "Cambiar deposito"', () => {
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.getByRole('combobox')).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Cambiar deposito/i })).not.toBeInTheDocument()
  })

  it('el usuario puede elegir libremente cualquier deposito activo, sin PIN', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'dep-2')

    expect(select).toHaveValue('dep-2')
    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()
  })
})
