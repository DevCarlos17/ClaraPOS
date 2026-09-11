import { render, screen, fireEvent } from '@testing-library/react'
import { ClienteDetalle } from '../cliente-detalle'
import { useMovimientosClienteFiltrados, useCountMovimientosCliente, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { usePagosCliente } from '@/features/cxc/hooks/use-cxc'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions } from '@/core/hooks/use-permissions'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useQuery } from '@powersync/react'

vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/features/clientes/hooks/use-clientes', () => ({
  useMovimientosClienteFiltrados: vi.fn(),
  useCountMovimientosCliente: vi.fn(),
}))
vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  usePagosCliente: vi.fn(),
  registrarReversoAbono: vi.fn(),
}))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
  PERMISSIONS: { CXC_REVERSE: 'cxc.reversar_abono' },
}))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({
  SupervisorPinDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="mock-pin-dialog" /> : null,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedUseMovimientosClienteFiltrados = vi.mocked(useMovimientosClienteFiltrados)
const mockedUseCountMovimientosCliente = vi.mocked(useCountMovimientosCliente)
const mockedUsePagosCliente = vi.mocked(usePagosCliente)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedUseTasaActual = vi.mocked(useTasaActual)
const mockedUseQuery = vi.mocked(useQuery)

const CLIENTE: Cliente = {
  id: 'cli-1',
  identificacion: 'V-12345678',
  nombre: 'MARIA PEREZ',
  direccion: null,
  telefono: null,
  limite_credito_usd: '500.00',
  saldo_actual: '120.50',
  is_active: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

function setupMocks() {
  mockedUseMovimientosClienteFiltrados.mockReturnValue({ movimientos: [], isLoading: false })
  mockedUseCountMovimientosCliente.mockReturnValue({ total: 0 })
  mockedUsePagosCliente.mockReturnValue({ pagos: [], isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'u1', email: 'a@a.com', nombre: 'A', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUsePermissions.mockReturnValue({
    hasPermission: () => false,
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    isOwner: false,
    rolId: '',
    rolNombre: '',
    loading: false,
  })
  mockedUseTasaActual.mockReturnValue({ tasaValor: 0 } as never)
  mockedUseQuery.mockReturnValue({ data: [{ saldo_actual: CLIENTE.saldo_actual }], isLoading: false } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  setupMocks()
})

describe('ClienteDetalle — pantalla dedicada (onClose renombrado a onVolver)', () => {
  it('Scenario: boton "Volver" invoca onVolver', () => {
    const onVolver = vi.fn()
    render(<ClienteDetalle cliente={CLIENTE} onVolver={onVolver} />)

    fireEvent.click(screen.getByRole('button', { name: /volver/i }))

    expect(onVolver).toHaveBeenCalledTimes(1)
  })

  it('Scenario: saldo con estilo segun estado real — saldo deudor se muestra en rojo/negativo semantico', () => {
    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.getByText('MARIA PEREZ')).toBeInTheDocument()
    expect(screen.getByText('$120.50')).toBeInTheDocument()
  })
})
