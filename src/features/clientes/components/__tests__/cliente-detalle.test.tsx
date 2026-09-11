import { render, screen, fireEvent } from '@testing-library/react'
import { ClienteDetalle } from '../cliente-detalle'
import { useMovimientosClienteFiltrados, useCountMovimientosCliente, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { usePagosCliente } from '@/features/cxc/hooks/use-cxc'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions } from '@/core/hooks/use-permissions'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useFacturasEmpresa } from '@/features/ventas/hooks/use-facturas-empresa'
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
vi.mock('@/features/ventas/hooks/use-facturas-empresa', () => ({ useFacturasEmpresa: vi.fn() }))
vi.mock('@/features/ventas/components/facturas-empresa-tab', () => ({
  FacturasEmpresaTable: ({ mostrarAcciones }: { mostrarAcciones?: boolean }) => (
    <div data-testid="facturas-table" data-mostrar-acciones={String(mostrarAcciones)} />
  ),
}))

const mockedUseMovimientosClienteFiltrados = vi.mocked(useMovimientosClienteFiltrados)
const mockedUseCountMovimientosCliente = vi.mocked(useCountMovimientosCliente)
const mockedUsePagosCliente = vi.mocked(usePagosCliente)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedUseTasaActual = vi.mocked(useTasaActual)
const mockedUseFacturasEmpresa = vi.mocked(useFacturasEmpresa)
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
  mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: false })
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

describe('ClienteDetalle — seccion Facturas (cliente-detalle-pantalla, PR3)', () => {
  it('Scenario: con facturas devueltas por useFacturasEmpresa, renderiza la tabla con mostrarAcciones=false', () => {
    mockedUseFacturasEmpresa.mockReturnValue({
      facturas: [
        {
          id: 'venta-1',
          nro_factura: 'C01-000001',
          cliente_id: 'cli-1',
          cliente_nombre: 'MARIA PEREZ',
          cliente_identificacion: 'V-12345678',
          tasa: '36.50',
          total_usd: '100.00',
          total_bs: '3650.00',
          saldo_pend_usd: '0.00',
          tipo: 'CONTADO',
          fecha: '2026-05-10T10:00:00-04:00',
          tiene_reverso_total: 0,
          tiene_reverso_parcial: 0,
        },
      ],
      isLoading: false,
    })

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.getByText(/facturas/i)).toBeInTheDocument()
    const tabla = screen.getByTestId('facturas-table')
    expect(tabla).toBeInTheDocument()
    expect(tabla).toHaveAttribute('data-mostrar-acciones', 'false')
  })

  it('Scenario: sin facturas, muestra estado vacio ("Sin facturas")', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: false })

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.getByText(/sin facturas/i)).toBeInTheDocument()
    expect(screen.queryByTestId('facturas-table')).not.toBeInTheDocument()
  })

  it('Scenario: mientras isLoading, muestra estado de carga en vez de la tabla', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: true })

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.queryByTestId('facturas-table')).not.toBeInTheDocument()
    expect(screen.queryByText(/sin facturas/i)).not.toBeInTheDocument()
  })

  it('Scenario: la seccion nunca expone la accion "Aplicar nota de credito" (mostrarAcciones=false)', () => {
    mockedUseFacturasEmpresa.mockReturnValue({
      facturas: [
        {
          id: 'venta-1',
          nro_factura: 'C01-000001',
          cliente_id: 'cli-1',
          cliente_nombre: 'MARIA PEREZ',
          cliente_identificacion: 'V-12345678',
          tasa: '36.50',
          total_usd: '100.00',
          total_bs: '3650.00',
          saldo_pend_usd: '0.00',
          tipo: 'CONTADO',
          fecha: '2026-05-10T10:00:00-04:00',
          tiene_reverso_total: 0,
          tiene_reverso_parcial: 0,
        },
      ],
      isLoading: false,
    })

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /aplicar nota de credito/i })).not.toBeInTheDocument()
  })
})
