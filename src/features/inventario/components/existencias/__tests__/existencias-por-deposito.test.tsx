import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExistenciasPorDeposito } from '../existencias-por-deposito'
import { useExistenciasPorDeposito } from '@/features/inventario/hooks/use-inventario-stock'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// Mismo patron que traspaso-form.test.tsx: mockear `@/core/db/powersync/db`
// primero porque `useCurrentUser` importa transitivamente `auth-provider`,
// que instancia una PowerSyncDatabase real (Worker) al importarse.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/inventario/hooks/use-inventario-stock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-inventario-stock')>()
  return { ...actual, useExistenciasPorDeposito: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, useDepositosActivos: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

const mockedUseExistencias = vi.mocked(useExistenciasPorDeposito)
const mockedUseDepositosActivos = vi.mocked(useDepositosActivos)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

const DEPOSITOS = [
  { id: 'dep-B', nombre: 'Deposito Beta', es_principal: 0 },
  { id: 'dep-A', nombre: 'Deposito Alfa', es_principal: 1 },
]

const ROWS = [
  {
    producto_id: 'prod-1',
    codigo: 'P-001',
    nombre: 'Producto Uno',
    cantidadPorDeposito: { 'dep-A': '12.500', 'dep-B': '3.000' },
  },
  {
    producto_id: 'prod-2',
    codigo: 'P-002',
    nombre: 'Producto Dos',
    cantidadPorDeposito: { 'dep-A': '7.000' },
  },
]

function setupMocks(overrides: {
  rows?: typeof ROWS
  rowsLoading?: boolean
  depositos?: typeof DEPOSITOS
  depositosLoading?: boolean
} = {}) {
  mockedUseExistencias.mockReturnValue({
    rows: overrides.rows ?? ROWS,
    isLoading: overrides.rowsLoading ?? false,
  } as never)
  mockedUseDepositosActivos.mockReturnValue({
    depositos: overrides.depositos ?? DEPOSITOS,
    isLoading: overrides.depositosLoading ?? false,
  } as never)
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExistenciasPorDeposito — filas y columnas (EPD/Filas de Productos Almacenables, EPD/Columnas de Depositos Activos Ordenadas)', () => {
  it('renderiza una fila por producto y las columnas de deposito con el principal primero', () => {
    setupMocks()
    render(<ExistenciasPorDeposito />)

    expect(screen.getByText('Producto Uno')).toBeInTheDocument()
    expect(screen.getByText('Producto Dos')).toBeInTheDocument()

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    const idxAlfa = headers.findIndex((h) => h?.includes('Deposito Alfa'))
    const idxBeta = headers.findIndex((h) => h?.includes('Deposito Beta'))
    expect(idxAlfa).toBeGreaterThanOrEqual(0)
    expect(idxBeta).toBeGreaterThan(idxAlfa)
  })

  it('celda sin fila de stock para ese (producto,deposito) muestra 0.000, sin dropear el producto', () => {
    setupMocks()
    render(<ExistenciasPorDeposito />)

    const fila = screen.getByText('Producto Dos').closest('tr')
    expect(fila).not.toBeNull()
    expect(fila!.textContent).toContain('0.000')
    expect(fila!.textContent).toContain('7.000')
  })
})

describe('ExistenciasPorDeposito — busqueda (EPD/Filtro de Busqueda por Nombre o Codigo)', () => {
  it('el texto de busqueda narrows filas por nombre', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<ExistenciasPorDeposito />)

    const buscador = screen.getByPlaceholderText(/buscar/i)
    await user.type(buscador, 'Producto Uno')

    expect(screen.getByText('Producto Uno')).toBeInTheDocument()
    expect(screen.queryByText('Producto Dos')).not.toBeInTheDocument()
  })

  it('el texto de busqueda narrows filas por codigo', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<ExistenciasPorDeposito />)

    const buscador = screen.getByPlaceholderText(/buscar/i)
    await user.type(buscador, 'P-002')

    expect(screen.getByText('Producto Dos')).toBeInTheDocument()
    expect(screen.queryByText('Producto Uno')).not.toBeInTheDocument()
  })

  it('busqueda sin resultados muestra un estado vacio', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<ExistenciasPorDeposito />)

    const buscador = screen.getByPlaceholderText(/buscar/i)
    await user.type(buscador, 'NO EXISTE NINGUN PRODUCTO ASI')

    expect(screen.getByText(/no se encontraron productos/i)).toBeInTheDocument()
  })
})

describe('ExistenciasPorDeposito — estados vacios (EPD/Estados Vacios sin Depositos o sin Productos)', () => {
  it('sin productos tipo P: muestra un estado vacio en vez de tabla sin filas', () => {
    setupMocks({ rows: [] })
    render(<ExistenciasPorDeposito />)

    expect(screen.getByText(/no hay productos almacenables/i)).toBeInTheDocument()
  })

  it('sin depositos activos: muestra un estado vacio en vez de tabla sin columnas', () => {
    setupMocks({ depositos: [] })
    render(<ExistenciasPorDeposito />)

    expect(screen.getByText(/no hay depositos activos configurados/i)).toBeInTheDocument()
  })
})
