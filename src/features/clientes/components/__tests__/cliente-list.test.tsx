import { render, screen, within } from '@testing-library/react'
import { ClienteList } from '../cliente-list'
import { useClientes, actualizarCliente, tieneMovimientos } from '@/features/clientes/hooks/use-clientes'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import type { Cliente } from '@/features/clientes/hooks/use-clientes'

// `ClienteList` renderiza `ClienteForm` incondicionalmente (dialog oculto) y
// solo monta `ClienteDetalle` al hacer click en una fila — se mockean sus 2
// hooks de datos y el form hijo, mismo patron que `kardex-list.test.tsx`.
vi.mock('@/features/clientes/hooks/use-clientes', () => ({
  useClientes: vi.fn(),
  actualizarCliente: vi.fn(),
  tieneMovimientos: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))
vi.mock('../cliente-form', () => ({ ClienteForm: () => null }))
// `ClienteDetalle` importa `@/features/cxc/hooks/use-cxc`, que a su vez
// importa `@/core/db/powersync/db` (instancia real de PowerSync -> "Worker is
// not defined" en jsdom). No se necesita en estos tests (no se hace click en
// ninguna fila), asi que se mockea a null, mismo criterio que `cliente-form`.
vi.mock('../cliente-detalle', () => ({ ClienteDetalle: () => null }))

const mockedUseClientes = vi.mocked(useClientes)
const mockedUseTasaActual = vi.mocked(useTasaActual)
void actualizarCliente
void tieneMovimientos

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

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseTasaActual.mockReturnValue({
    tasa: undefined,
    tasaValor: 40,
    isLoading: false,
    isFromCache: false,
  } as never)
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
