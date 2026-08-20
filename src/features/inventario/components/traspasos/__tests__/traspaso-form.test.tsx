import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TraspasoForm } from '../traspaso-form'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { crearTraspaso } from '@/features/inventario/hooks/use-traspasos'
import { useStockPorDeposito } from '@/features/inventario/hooks/use-inventario-stock'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// Mismo patron que movimiento-form.test.tsx: mockeamos `@/core/db/powersync/db`
// primero porque los modulos reales importados transitivamente (via
// `useCurrentUser` -> `auth-provider`) construyen una PowerSyncDatabase real
// (efecto de modulo top-level) y revientan con "Worker is not defined" en el
// entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/inventario/hooks/use-productos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-productos')>()
  return { ...actual, useProductos: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, useDepositosActivos: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-traspasos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-traspasos')>()
  return { ...actual, crearTraspaso: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-inventario-stock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-inventario-stock')>()
  return { ...actual, useStockPorDeposito: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

const mockedUseProductos = vi.mocked(useProductos)
const mockedUseDepositosActivos = vi.mocked(useDepositosActivos)
const mockedCrearTraspaso = vi.mocked(crearTraspaso)
const mockedUseStockPorDeposito = vi.mocked(useStockPorDeposito)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

const PRODUCTOS = [
  { id: 'prod-1', codigo: 'P-001', nombre: 'Producto Uno', tipo: 'P', is_active: 1 },
  { id: 'prod-2', codigo: 'P-002', nombre: 'Producto Dos', tipo: 'P', is_active: 1 },
]

const DEPOSITOS = [
  { id: 'dep-A', nombre: 'Deposito A', es_principal: 1 },
  { id: 'dep-B', nombre: 'Deposito B', es_principal: 0 },
]

function setupMocks() {
  mockedUseProductos.mockReturnValue({ productos: PRODUCTOS as never, isLoading: false })
  mockedUseDepositosActivos.mockReturnValue({ depositos: DEPOSITOS as never, isLoading: false })
  mockedUseStockPorDeposito.mockReturnValue({ stock: [], isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCrearTraspaso.mockResolvedValue({ traspasoId: 'traspaso-1', correlativo: 1 })
})

async function seleccionarProducto(user: ReturnType<typeof userEvent.setup>, index: number, query: string, nombreCompleto: string) {
  const buscadores = screen.getAllByPlaceholderText(/buscar/i)
  await user.type(buscadores[index]!, query)
  await user.click(await screen.findByText(new RegExp(nombreCompleto, 'i')))
}

describe('TraspasoForm — deposito origen/destino (TRI/Traspaso Atomico Individual)', () => {
  it('bloquea el submit cuando origen y destino son el mismo deposito, mostrando un mensaje claro', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    const selectOrigen = selects[0] as HTMLSelectElement
    const selectDestino = selects[1] as HTMLSelectElement

    await user.selectOptions(selectOrigen, 'dep-A')
    await user.selectOptions(selectDestino, 'dep-A')

    expect(await screen.findByText(/deben ser diferentes/i)).toBeInTheDocument()

    const submitBtn = screen.getByRole('button', { name: /registrar traspaso/i })
    expect(submitBtn).toBeDisabled()
    expect(mockedCrearTraspaso).not.toHaveBeenCalled()
  })

  it('traspaso individual (1 linea) llama a crearTraspaso con el payload correcto', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')

    const cantidadInputs = screen.getAllByPlaceholderText('0.000')
    await user.type(cantidadInputs[0]!, '4')

    fireEvent.submit(screen.getByRole('button', { name: /registrar traspaso/i }).closest('form')!)

    await waitFor(() => {
      expect(mockedCrearTraspaso).toHaveBeenCalled()
    })
    expect(mockedCrearTraspaso.mock.calls[0]![0]).toMatchObject({
      empresa_id: 'emp-1',
      usuario_id: 'user-1',
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: 4 }],
    })
  })

  it('traspaso por lote (N lineas): agrega una segunda linea con "Agregar producto" y envia ambas', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0]!, 'dep-A')
    await user.selectOptions(selects[1]!, 'dep-B')

    await seleccionarProducto(user, 0, 'Producto Uno', 'Producto Uno')
    const cantidadInputs1 = screen.getAllByPlaceholderText('0.000')
    await user.type(cantidadInputs1[0]!, '2')

    await user.click(screen.getByRole('button', { name: /agregar producto/i }))
    // Linea 1 ya tiene producto seleccionado (deja de ser un buscador de
    // texto y pasa a mostrar codigo+nombre), asi que el unico buscador de
    // texto restante en pantalla es el de la linea 2 recien agregada.
    await seleccionarProducto(user, 0, 'Producto Dos', 'Producto Dos')
    const cantidadInputs2 = screen.getAllByPlaceholderText('0.000')
    await user.type(cantidadInputs2[1]!, '3')

    fireEvent.submit(screen.getByRole('button', { name: /registrar traspaso/i }).closest('form')!)

    await waitFor(() => {
      expect(mockedCrearTraspaso).toHaveBeenCalled()
    })
    expect(mockedCrearTraspaso.mock.calls[0]![0]).toMatchObject({
      lineas: [
        { producto_id: 'prod-1', cantidad: 2 },
        { producto_id: 'prod-2', cantidad: 3 },
      ],
    })
  })

  it('permite quitar una linea con el boton de remover', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<TraspasoForm isOpen onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: /agregar producto/i }))
    expect(screen.getAllByPlaceholderText(/buscar/i)).toHaveLength(2)

    const removeButtons = screen.getAllByRole('button', { name: /quitar linea/i })
    await user.click(removeButtons[0]!)

    expect(screen.getAllByPlaceholderText(/buscar/i)).toHaveLength(1)
  })
})
