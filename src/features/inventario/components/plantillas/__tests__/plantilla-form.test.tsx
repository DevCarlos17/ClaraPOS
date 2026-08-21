import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlantillaForm } from '../plantilla-form'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import {
  usePlantillaProductos,
  crearPlantilla,
  actualizarPlantilla,
  type PlantillaConProductos,
} from '@/features/inventario/hooks/use-plantillas-traspaso'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// Mismo patron que traspaso-form.test.tsx: mockeamos `@/core/db/powersync/db`
// primero porque los modulos reales importados transitivamente construyen
// una PowerSyncDatabase real (efecto de modulo top-level) y revientan con
// "Worker is not defined" en el entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/inventario/hooks/use-productos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-productos')>()
  return { ...actual, useProductos: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-plantillas-traspaso', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-plantillas-traspaso')>()
  return {
    ...actual,
    usePlantillaProductos: vi.fn(),
    crearPlantilla: vi.fn(),
    actualizarPlantilla: vi.fn(),
  }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

const mockedUseProductos = vi.mocked(useProductos)
const mockedUsePlantillaProductos = vi.mocked(usePlantillaProductos)
const mockedCrearPlantilla = vi.mocked(crearPlantilla)
const mockedActualizarPlantilla = vi.mocked(actualizarPlantilla)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

const PRODUCTOS = [
  { id: 'prod-1', codigo: 'P-001', nombre: 'Producto Uno', tipo: 'P', is_active: 1 },
  { id: 'prod-2', codigo: 'P-002', nombre: 'Producto Dos', tipo: 'P', is_active: 1 },
  { id: 'prod-3', codigo: 'P-003', nombre: 'Producto Tres', tipo: 'P', is_active: 1 },
]

const PLANTILLA_EXISTENTE: PlantillaConProductos = {
  id: 'plant-1',
  empresa_id: 'emp-1',
  nombre: 'REPOSICION MOSTRADOR',
  descripcion: 'Set mensual',
  is_active: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  created_by: null,
  updated_by: null,
  items_count: 1,
}

function setupMocks(plantillaProductos: Array<{ producto_id: string }> = []) {
  mockedUseProductos.mockReturnValue({ productos: PRODUCTOS as never, isLoading: false })
  mockedUsePlantillaProductos.mockReturnValue({
    productos: plantillaProductos.map((p) => ({
      id: `det-${p.producto_id}`,
      producto_id: p.producto_id,
      producto_nombre: PRODUCTOS.find((prod) => prod.id === p.producto_id)?.nombre ?? '',
      producto_codigo: PRODUCTOS.find((prod) => prod.id === p.producto_id)?.codigo ?? '',
      producto_is_active: 1,
    })) as never,
    isLoading: false,
  })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCrearPlantilla.mockResolvedValue('plant-new')
  mockedActualizarPlantilla.mockResolvedValue(undefined)
})

describe('PlantillaForm — validaciones (Rechazo sin nombre, Rechazo sin productos)', () => {
  it('rechaza el submit con nombre vacio y no llama a crearPlantilla', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<PlantillaForm isOpen onClose={() => {}} />)

    await user.click(screen.getByRole('checkbox', { name: /producto uno/i }))
    await user.click(screen.getByRole('button', { name: /crear/i }))

    expect(await screen.findByText(/el nombre es obligatorio/i)).toBeInTheDocument()
    expect(mockedCrearPlantilla).not.toHaveBeenCalled()
  })

  it('rechaza el submit sin productos seleccionados y no llama a crearPlantilla', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<PlantillaForm isOpen onClose={() => {}} />)

    await user.type(screen.getByLabelText(/nombre/i), 'Set Sin Productos')
    await user.click(screen.getByRole('button', { name: /crear/i }))

    expect(await screen.findByText(/al menos un producto/i)).toBeInTheDocument()
    expect(mockedCrearPlantilla).not.toHaveBeenCalled()
  })
})

describe('PlantillaForm — creacion (Plantilla creada correctamente)', () => {
  it('submit valido llama a crearPlantilla con el nombre y los productoIds exactos', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<PlantillaForm isOpen onClose={() => {}} />)

    await user.type(screen.getByLabelText(/nombre/i), 'reposicion mostrador')
    await user.click(screen.getByRole('checkbox', { name: /producto uno/i }))
    await user.click(screen.getByRole('checkbox', { name: /producto tres/i }))
    await user.click(screen.getByRole('button', { name: /crear/i }))

    await waitFor(() => {
      expect(mockedCrearPlantilla).toHaveBeenCalled()
    })
    expect(mockedCrearPlantilla.mock.calls[0]![0]).toMatchObject({
      nombre: 'REPOSICION MOSTRADOR',
      empresa_id: 'emp-1',
      productoIds: ['prod-1', 'prod-3'],
    })
  })
})

describe('PlantillaForm — edicion (Edicion de nombre y productos)', () => {
  it('precarga los productos actuales de la plantilla y permite agregar uno nuevo antes de actualizar', async () => {
    const user = userEvent.setup()
    setupMocks([{ producto_id: 'prod-1' }])
    render(<PlantillaForm isOpen onClose={() => {}} plantilla={PLANTILLA_EXISTENTE} />)

    const checkboxUno = await screen.findByRole('checkbox', { name: /producto uno/i })
    expect(checkboxUno).toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: /producto dos/i }))
    await user.click(screen.getByRole('button', { name: /actualizar/i }))

    await waitFor(() => {
      expect(mockedActualizarPlantilla).toHaveBeenCalled()
    })
    const [id, payload] = mockedActualizarPlantilla.mock.calls[0]!
    expect(id).toBe('plant-1')
    expect(payload.productoIds).toEqual(expect.arrayContaining(['prod-1', 'prod-2']))
    expect(payload.productoIds).toHaveLength(2)
  })
})
