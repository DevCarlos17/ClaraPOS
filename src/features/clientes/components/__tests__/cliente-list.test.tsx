import { render, screen, within, fireEvent } from '@testing-library/react'
import { ClienteList } from '../cliente-list'
import { useClientes, actualizarCliente, tieneMovimientos, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useNavigate } from '@tanstack/react-router'

vi.mock('@/features/clientes/hooks/use-clientes', () => ({
  useClientes: vi.fn(),
  actualizarCliente: vi.fn(),
  tieneMovimientos: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))
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
void actualizarCliente

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
})

describe('ClienteList — estilo de saldo de tres estados en la fila (paridad con cliente-detalle)', () => {
  it('saldo positivo (deuda) se muestra en rojo', () => {
    mockedUseClientes.mockReturnValue({
      clientes: [cliente({ saldo_actual: '150.00000000' })],
      isLoading: false,
    } as never)

    render(<ClienteList />)

    const fila = screen.getByText('V-12345678').closest('tr')!
    const saldoEl = within(fila).getByText('$150.00')
    expect(saldoEl).toHaveClass('text-red-600')
  })

  it('saldo negativo (a favor) se muestra en verde', () => {
    mockedUseClientes.mockReturnValue({
      clientes: [cliente({ saldo_actual: '-30.00000000' })],
      isLoading: false,
    } as never)

    render(<ClienteList />)

    const fila = screen.getByText('V-12345678').closest('tr')!
    const saldoEl = within(fila).getByText('-$30.00')
    expect(saldoEl).toHaveClass('text-green-600')
  })

  it('saldo exactamente en cero se muestra en estilo neutral, no rojo ni verde (inconsistencia previa: el 2-estado anterior mostraba verde)', () => {
    mockedUseClientes.mockReturnValue({
      clientes: [cliente({ saldo_actual: '0.00000000' })],
      isLoading: false,
    } as never)

    render(<ClienteList />)

    const fila = screen.getByText('V-12345678').closest('tr')!
    const saldoEl = within(fila).getByText('$0.00')
    expect(saldoEl).toHaveClass('text-muted-foreground')
    expect(saldoEl).not.toHaveClass('text-red-600')
    expect(saldoEl).not.toHaveClass('text-green-600')
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
