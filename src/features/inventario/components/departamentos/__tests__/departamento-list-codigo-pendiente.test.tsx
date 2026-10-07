import { render, screen } from '@testing-library/react'
import { DepartamentoList } from '../departamento-list'
import { useDepartamentos } from '@/features/inventario/hooks/use-departamentos'

// Mismo patron que producto-list-deposito-col.test.tsx: cortamos la
// PowerSyncDatabase real (efecto top-level via `useCurrentUser` ->
// `auth-provider`) antes de que reviente con "Worker is not defined" en el
// entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/inventario/hooks/use-departamentos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-departamentos')>()
  return { ...actual, useDepartamentos: vi.fn() }
})

// El form y los modales hijos arrastran su propio arbol de hooks irrelevantes
// para la columna Codigo de la tabla — los stubeamos para aislar la lista.
vi.mock('../departamento-form', () => ({ DepartamentoForm: () => null }))
vi.mock('../departamento-articulos-modal', () => ({ DepartamentoArticulosModal: () => null }))
vi.mock('../departamento-reporte', () => ({ DepartamentoReporte: () => null }))

const mockedUseDepartamentos = vi.mocked(useDepartamentos)

const BASE_DEPARTAMENTO = {
  nombre: 'DEPARTAMENTO',
  parent_id: null,
  descripcion: null,
  prioridad_visual: 0,
  is_active: 1,
  created_at: '',
  updated_at: '',
  articulos_activos: 0,
}

function setupMocks(departamentos: unknown[]) {
  mockedUseDepartamentos.mockReturnValue({ departamentos: departamentos as never, isLoading: false })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DepartamentoList — columna Codigo pendiente de sincronizacion', () => {
  it('muestra el badge "PENDIENTE" cuando codigo esta vacio (creado offline, sin sincronizar)', () => {
    setupMocks([{ ...BASE_DEPARTAMENTO, id: 'dep-1', codigo: '' }])
    render(<DepartamentoList />)
    expect(screen.getByText('PENDIENTE')).toBeInTheDocument()
  })

  it('muestra el codigo real y NO el badge cuando ya fue asignado por el servidor', () => {
    setupMocks([{ ...BASE_DEPARTAMENTO, id: 'dep-2', codigo: '1' }])
    render(<DepartamentoList />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('PENDIENTE')).not.toBeInTheDocument()
  })
})
