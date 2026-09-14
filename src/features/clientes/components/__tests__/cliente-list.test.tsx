import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { ClienteList } from '../cliente-list'
import { useClientes, actualizarCliente, tieneMovimientos, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useDeudaFacturasClientes, useCreditoFavorClientes } from '@/features/cxc/hooks/use-deuda-cliente'
import { useNavigate } from '@tanstack/react-router'

vi.mock('@/features/clientes/hooks/use-clientes', () => ({
  useClientes: vi.fn(),
  actualizarCliente: vi.fn(),
  tieneMovimientos: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))
vi.mock('@/features/cxc/hooks/use-deuda-cliente', () => ({
  useDeudaFacturasClientes: vi.fn(),
  useCreditoFavorClientes: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Primer precedente de este mock en el repo (design.md Testing Strategy):
// `ClienteList` navega en vez de mutar estado local, consistente con el resto
// de mocks shallow por hook.
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: vi.fn() }))

// Aislamos el test de la implementacion interna de `ClienteForm` — irrelevante
// para el flujo de navegacion hacia el detalle.
vi.mock('../cliente-form', () => ({ ClienteForm: () => null }))

// `ClienteDetalle` ya no se monta inline en `ClienteList` (se retiro el panel
// lateral), pero por seguridad se mockea con un sentinel para poder DETECTAR
// si todavia se montara — que es exactamente lo que este cambio retira
// (Requirement: Navegacion a pantalla dedicada).
vi.mock('../cliente-detalle', () => ({
  ClienteDetalle: () => <div data-testid="cliente-detalle-inline-mock" />,
}))

const mockedUseClientes = vi.mocked(useClientes)
const mockedUseTasaActual = vi.mocked(useTasaActual)
const mockedTieneMovimientos = vi.mocked(tieneMovimientos)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseDeudaFacturasClientes = vi.mocked(useDeudaFacturasClientes)
const mockedUseCreditoFavorClientes = vi.mocked(useCreditoFavorClientes)
const mockedActualizarCliente = vi.mocked(actualizarCliente)
const mockedToastError = vi.mocked(toast.error)

function cliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 'cli-1',
    identificacion: 'V-12345678',
    nombre: 'Maria Perez',
    direccion: null,
    telefono: null,
    limite_credito_usd: '500.00',
    saldo_actual: '150.00000000',
    is_active: 1,
    created_at: '2026-01-01T00:00:00-04:00',
    updated_at: '2026-01-01T00:00:00-04:00',
    ...overrides,
  }
}

const CLIENTE_1: Cliente = {
  id: 'cli-1',
  identificacion: 'V-12345678',
  nombre: 'MARIA PEREZ',
  direccion: null,
  telefono: '0414-1234567',
  limite_credito_usd: '500.00',
  saldo_actual: '100.00',
  is_active: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

const CLIENTE_2: Cliente = {
  id: 'cli-2',
  identificacion: 'V-87654321',
  nombre: 'JUAN GOMEZ',
  direccion: null,
  telefono: null,
  limite_credito_usd: '300.00',
  saldo_actual: '0.00',
  is_active: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseTasaActual.mockReturnValue({
    tasa: undefined,
    tasaValor: 40,
    isLoading: false,
    isFromCache: false,
  } as never)
  mockedTieneMovimientos.mockResolvedValue(false)
  mockedUseNavigate.mockReturnValue(mockNavigate)
  mockedUseDeudaFacturasClientes.mockReturnValue({})
  mockedUseCreditoFavorClientes.mockReturnValue({})
})

describe('ClienteList — deuda y saldo a favor separados en la fila (nunca neteados)', () => {
  it('cliente con solo deuda: muestra el monto en rojo', () => {
    mockedUseClientes.mockReturnValue({ clientes: [cliente({ id: 'cli-1' })], isLoading: false } as never)
    mockedUseDeudaFacturasClientes.mockReturnValue({ 'cli-1': 150 })
    mockedUseCreditoFavorClientes.mockReturnValue({})

    render(<ClienteList />)

    const fila = screen.getByText('V-12345678').closest('tr')!
    const deudaEl = within(fila).getByText('$150.00')
    expect(deudaEl).toHaveClass('text-red-600')
  })

  it('cliente con solo saldo a favor: muestra el monto en verde con signo +', () => {
    mockedUseClientes.mockReturnValue({ clientes: [cliente({ id: 'cli-1' })], isLoading: false } as never)
    mockedUseDeudaFacturasClientes.mockReturnValue({})
    mockedUseCreditoFavorClientes.mockReturnValue({ 'cli-1': 30 })

    render(<ClienteList />)

    const fila = screen.getByText('V-12345678').closest('tr')!
    const creditoEl = within(fila).getByText('+$30.00')
    expect(creditoEl).toHaveClass('text-green-600')
  })

  it('cliente sin deuda ni saldo a favor: se muestra neutral, sin rojo ni verde', () => {
    mockedUseClientes.mockReturnValue({ clientes: [cliente({ id: 'cli-1' })], isLoading: false } as never)
    mockedUseDeudaFacturasClientes.mockReturnValue({})
    mockedUseCreditoFavorClientes.mockReturnValue({})

    render(<ClienteList />)

    const fila = screen.getByText('V-12345678').closest('tr')!
    const saldoEl = within(fila).getByText('$0.00')
    expect(saldoEl).toHaveClass('text-muted-foreground')
    expect(saldoEl).not.toHaveClass('text-red-600')
    expect(saldoEl).not.toHaveClass('text-green-600')
  })

  it('cliente con deuda Y saldo a favor simultaneos (caso del bug): muestra ambas cifras por separado, nunca neteadas', () => {
    mockedUseClientes.mockReturnValue({ clientes: [cliente({ id: 'cli-1' })], isLoading: false } as never)
    mockedUseDeudaFacturasClientes.mockReturnValue({ 'cli-1': 10 })
    mockedUseCreditoFavorClientes.mockReturnValue({ 'cli-1': 11.51 })

    render(<ClienteList />)

    const fila = screen.getByText('V-12345678').closest('tr')!
    expect(within(fila).getByText('$10.00')).toHaveClass('text-red-600')
    expect(within(fila).getByText('+$11.51')).toHaveClass('text-green-600')
    expect(within(fila).queryByText('-$1.51')).not.toBeInTheDocument()
  })
})

describe('ClienteList — KPIs de deuda y saldo a favor totales (nunca suma saldo_actual neteado)', () => {
  it('suma deuda y saldo a favor por separado desde los mapas batch, solo clientes activos', () => {
    mockedUseClientes.mockReturnValue({
      clientes: [
        cliente({ id: 'cli-1', is_active: 1 }),
        cliente({ id: 'cli-2', identificacion: 'V-99999999', is_active: 1 }),
        cliente({ id: 'cli-3', identificacion: 'V-11111111', is_active: 0 }),
      ],
      isLoading: false,
    } as never)
    mockedUseDeudaFacturasClientes.mockReturnValue({ 'cli-1': 100, 'cli-2': 50, 'cli-3': 999 })
    mockedUseCreditoFavorClientes.mockReturnValue({ 'cli-1': 20, 'cli-2': 15, 'cli-3': 999 })

    render(<ClienteList />)

    expect(screen.getByText('Deuda Total')).toBeInTheDocument()
    expect(screen.getByText('$150.00')).toBeInTheDocument()
    expect(screen.getByText('Saldo a Favor Total')).toBeInTheDocument()
    expect(screen.getByText('+$35.00')).toBeInTheDocument()
  })
})

describe('ClienteList — guard de desactivacion usa el modelo separado (deuda O credito > 0), no saldo_actual neteado', () => {
  it('bloquea la desactivacion cuando hay deuda Y credito que se netean a 0 en saldo_actual', async () => {
    mockedUseClientes.mockReturnValue({
      clientes: [cliente({ id: 'cli-1', saldo_actual: '0.00', is_active: 1 })],
      isLoading: false,
    } as never)
    mockedTieneMovimientos.mockResolvedValue(true)
    mockedUseDeudaFacturasClientes.mockReturnValue({ 'cli-1': 10 })
    mockedUseCreditoFavorClientes.mockReturnValue({ 'cli-1': 10 })

    render(<ClienteList />)

    fireEvent.click(screen.getByText('Activo'))

    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalledWith('No se puede desactivar: tiene saldo pendiente')
    })
    expect(mockedActualizarCliente).not.toHaveBeenCalled()
  })

  it('permite la desactivacion cuando deuda y credito son ambos 0, aunque tenga movimientos historicos', async () => {
    mockedUseClientes.mockReturnValue({
      clientes: [cliente({ id: 'cli-1', saldo_actual: '0.00', is_active: 1 })],
      isLoading: false,
    } as never)
    mockedTieneMovimientos.mockResolvedValue(true)
    mockedUseDeudaFacturasClientes.mockReturnValue({})
    mockedUseCreditoFavorClientes.mockReturnValue({})

    render(<ClienteList />)

    fireEvent.click(screen.getByText('Activo'))

    await waitFor(() => {
      expect(mockedActualizarCliente).toHaveBeenCalledWith('cli-1', { is_active: false })
    })
    expect(mockedToastError).not.toHaveBeenCalled()
  })
})

describe('ClienteList — navegacion a pantalla dedicada (Requirement: Navegacion a pantalla dedicada)', () => {
  beforeEach(() => {
    mockedUseClientes.mockReturnValue({ clientes: [CLIENTE_1, CLIENTE_2], isLoading: false } as never)
  })

  it('Scenario: click en la fila navega a /clientes/gestion/$clienteId sin montar panel inline', () => {
    render(<ClienteList />)

    fireEvent.click(screen.getByText('MARIA PEREZ'))

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/clientes/gestion/$clienteId',
      params: { clienteId: 'cli-1' },
    })
    expect(screen.queryByTestId('cliente-detalle-inline-mock')).not.toBeInTheDocument()
  })

  it('Scenario: boton "Ver detalle" navega a /clientes/gestion/$clienteId', () => {
    render(<ClienteList />)

    fireEvent.click(screen.getAllByTitle('Ver detalle')[0])

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/clientes/gestion/$clienteId',
      params: { clienteId: 'cli-1' },
    })
  })

  it('Scenario: lista mantiene columnas y acciones completas — el boton "Ver detalle" sigue visible en todas las filas tras navegar', () => {
    render(<ClienteList />)

    fireEvent.click(screen.getByText('MARIA PEREZ'))

    expect(screen.getAllByTitle('Ver detalle')).toHaveLength(2)
  })
})
