import { render, screen } from '@testing-library/react'
import { ClienteForm } from '../cliente-form'
import { type Cliente } from '@/features/clientes/hooks/use-clientes'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useDeudaFacturasCliente } from '@/features/cxc/hooks/use-deuda-cliente'
import { useSaldoAFavor } from '@/core/hooks/use-saldo-a-favor'

vi.mock('@/features/clientes/hooks/use-clientes', () => ({
  crearCliente: vi.fn(),
  actualizarCliente: vi.fn(),
}))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/features/cxc/hooks/use-deuda-cliente', () => ({ useDeudaFacturasCliente: vi.fn() }))
vi.mock('@/core/hooks/use-saldo-a-favor', () => ({ useSaldoAFavor: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseDeudaFacturasCliente = vi.mocked(useDeudaFacturasCliente)
const mockedUseSaldoAFavor = vi.mocked(useSaldoAFavor)

function cliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 'cli-1',
    identificacion: 'V-12345678',
    nombre: 'MARIA PEREZ',
    direccion: null,
    telefono: null,
    limite_credito_usd: '500.00',
    saldo_actual: '0.00',
    is_active: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', empresa_id: 'emp-1', email: '', nombre: '', level: 1, rol_id: null, rol_nombre: null },
    loading: false,
  })
})

describe('ClienteForm — bloque de saldo separado en modo edicion (deuda / a favor, nunca neteados)', () => {
  it('muestra la deuda en rojo cuando hay deuda y no hay saldo a favor', () => {
    mockedUseDeudaFacturasCliente.mockReturnValue({ deudaFacturasUsd: 150, isLoading: false })
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 0, tieneSaf: false })

    render(<ClienteForm isOpen onClose={vi.fn()} cliente={cliente()} />)

    expect(screen.getByText('$150.00')).toHaveClass('text-red-600')
  })

  it('muestra el saldo a favor en verde con signo + cuando hay credito y no hay deuda', () => {
    mockedUseDeudaFacturasCliente.mockReturnValue({ deudaFacturasUsd: 0, isLoading: false })
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 30, tieneSaf: true })

    render(<ClienteForm isOpen onClose={vi.fn()} cliente={cliente()} />)

    expect(screen.getByText('+$30.00')).toHaveClass('text-green-600')
  })

  it('muestra ambas cifras por separado cuando el cliente tiene deuda Y saldo a favor simultaneos, sin netear', () => {
    mockedUseDeudaFacturasCliente.mockReturnValue({ deudaFacturasUsd: 10, isLoading: false })
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 11.51, tieneSaf: true })

    render(<ClienteForm isOpen onClose={vi.fn()} cliente={cliente()} />)

    expect(screen.getByText('$10.00')).toHaveClass('text-red-600')
    expect(screen.getByText('+$11.51')).toHaveClass('text-green-600')
    expect(screen.queryByText('-$1.51')).not.toBeInTheDocument()
  })

  it('modo creacion (sin cliente): no renderiza el bloque de saldo y llama los hooks con id null', () => {
    mockedUseDeudaFacturasCliente.mockReturnValue({ deudaFacturasUsd: 0, isLoading: false })
    mockedUseSaldoAFavor.mockReturnValue({ disponible: 0, tieneSaf: false })

    render(<ClienteForm isOpen onClose={vi.fn()} />)

    expect(mockedUseDeudaFacturasCliente).toHaveBeenCalledWith(null)
    expect(mockedUseSaldoAFavor).toHaveBeenCalledWith(null)
    expect(screen.queryByText(/Deuda:/)).not.toBeInTheDocument()
  })
})
