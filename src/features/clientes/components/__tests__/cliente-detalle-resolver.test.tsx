import { render, screen, fireEvent } from '@testing-library/react'
import { ClienteDetalleResolver } from '../cliente-detalle-resolver'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useQuery } from '@powersync/react'

// Mismo patron que plantilla-list.test.tsx/deposito-list.test.tsx: mockeamos
// `@/core/db/powersync/db` primero porque los modulos reales importados
// transitivamente (via el import de tipo `Cliente` desde use-clientes.ts)
// construyen una PowerSyncDatabase real (efecto de modulo top-level) y
// revientan con "Worker is not defined" en el entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

// Stub de ClienteDetalle: evita su cadena de hooks (useMovimientosClienteFiltrados,
// usePagosCliente, useTasaActual, usePermissions, etc.) que no es relevante para
// probar la resolucion clienteId -> Cliente de este componente.
vi.mock('../cliente-detalle', () => ({
  ClienteDetalle: (props: { cliente: { nombre: string }; onVolver: () => void }) => (
    <div data-testid="cliente-detalle-mock">
      <span data-testid="cliente-nombre">{props.cliente.nombre}</span>
      <button onClick={props.onVolver}>trigger-onvolver</button>
    </div>
  ),
}))

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseQuery = vi.mocked(useQuery)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClienteDetalleResolver — resolucion de ruta y aislamiento por empresa_id', () => {
  it('Scenario: loading — useCurrentUser cargando muestra indicador de carga', () => {
    mockedUseCurrentUser.mockReturnValue({ user: null, loading: true })
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    render(<ClienteDetalleResolver clienteId="cli-1" onVolver={vi.fn()} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByTestId('cliente-detalle-mock')).not.toBeInTheDocument()
  })

  it('Scenario: loading — useQuery cargando muestra indicador de carga', () => {
    mockedUseCurrentUser.mockReturnValue({
      user: { id: 'u1', email: 'a@a.com', nombre: 'A', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
      loading: false,
    })
    mockedUseQuery.mockReturnValue({ data: undefined, isLoading: true } as never)

    render(<ClienteDetalleResolver clienteId="cli-1" onVolver={vi.fn()} />)

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('Scenario: clienteId invalido/de otra empresa — muestra "no encontrado" con boton que invoca onVolver', () => {
    mockedUseCurrentUser.mockReturnValue({
      user: { id: 'u1', email: 'a@a.com', nombre: 'A', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
      loading: false,
    })
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)
    const onVolver = vi.fn()

    render(<ClienteDetalleResolver clienteId="cli-inexistente" onVolver={onVolver} />)

    expect(screen.getByText(/no encontrado/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /volver/i }))
    expect(onVolver).toHaveBeenCalledTimes(1)
  })

  it('Scenario: query de resolucion incluye empresa_id en el WHERE', () => {
    mockedUseCurrentUser.mockReturnValue({
      user: { id: 'u1', email: 'a@a.com', nombre: 'A', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
      loading: false,
    })
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    render(<ClienteDetalleResolver clienteId="cli-1" onVolver={vi.fn()} />)

    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.stringContaining('empresa_id'),
      ['cli-1', 'emp-1']
    )
  })

  it('Scenario: clienteId valido resuelve — renderiza ClienteDetalle con el cliente encontrado', () => {
    mockedUseCurrentUser.mockReturnValue({
      user: { id: 'u1', email: 'a@a.com', nombre: 'A', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
      loading: false,
    })
    mockedUseQuery.mockReturnValue({
      data: [{ id: 'cli-1', nombre: 'MARIA PEREZ', identificacion: 'V-1', empresa_id: 'emp-1', saldo_actual: '0' }],
      isLoading: false,
    } as never)
    const onVolver = vi.fn()

    render(<ClienteDetalleResolver clienteId="cli-1" onVolver={onVolver} />)

    expect(screen.getByTestId('cliente-nombre')).toHaveTextContent('MARIA PEREZ')
    fireEvent.click(screen.getByText('trigger-onvolver'))
    expect(onVolver).toHaveBeenCalledTimes(1)
  })
})
