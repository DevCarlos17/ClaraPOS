import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlantillaList } from '../plantilla-list'
import {
  usePlantillasTraspaso,
  desactivarPlantilla,
  type PlantillaConProductos,
} from '@/features/inventario/hooks/use-plantillas-traspaso'

// Mismo patron que traspaso-form.test.tsx: mockeamos `@/core/db/powersync/db`
// primero porque los modulos reales importados transitivamente construyen
// una PowerSyncDatabase real (efecto de modulo top-level) y revientan con
// "Worker is not defined" en el entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/inventario/hooks/use-plantillas-traspaso', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-plantillas-traspaso')>()
  return { ...actual, usePlantillasTraspaso: vi.fn(), desactivarPlantilla: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  }),
}))

// Aislamos el test del list de la implementacion interna del dialog
// (`PlantillaForm`, Slice B2) — solo verificamos que se abre con el modo
// (crear/editar) correcto.
vi.mock('../plantilla-form', () => ({
  PlantillaForm: ({ isOpen, plantilla }: { isOpen: boolean; plantilla?: PlantillaConProductos }) =>
    isOpen ? (
      <div data-testid="plantilla-form-dialog">{plantilla ? `Editando ${plantilla.nombre}` : 'Nueva plantilla'}</div>
    ) : null,
}))

const mockedUsePlantillasTraspaso = vi.mocked(usePlantillasTraspaso)
const mockedDesactivarPlantilla = vi.mocked(desactivarPlantilla)

const PLANTILLAS: PlantillaConProductos[] = [
  {
    id: 'plant-1',
    empresa_id: 'emp-1',
    nombre: 'REPOSICION MOSTRADOR',
    descripcion: 'Set mensual',
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: null,
    updated_by: null,
    items_count: 3,
  },
  {
    id: 'plant-2',
    empresa_id: 'emp-1',
    nombre: 'REPOSICION SEMANAL',
    descripcion: null,
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: null,
    updated_by: null,
    items_count: 5,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockedDesactivarPlantilla.mockResolvedValue(undefined)
})

describe('PlantillaList — listado (Aislamiento Multi-Tenant/Listado filtrado por empresa)', () => {
  it('renderiza una fila por plantilla con su nombre, descripcion y cantidad de productos', () => {
    mockedUsePlantillasTraspaso.mockReturnValue({ plantillas: PLANTILLAS, isLoading: false })
    render(<PlantillaList />)

    expect(screen.getByText('REPOSICION MOSTRADOR')).toBeInTheDocument()
    expect(screen.getByText('Set mensual')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()

    expect(screen.getByText('REPOSICION SEMANAL')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})

describe('PlantillaList — estado vacio (Estado Vacio sin Plantillas)', () => {
  it('muestra un mensaje de estado vacio cuando no hay plantillas', () => {
    mockedUsePlantillasTraspaso.mockReturnValue({ plantillas: [], isLoading: false })
    render(<PlantillaList />)

    expect(screen.getByText(/no hay plantillas registradas/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('PlantillaList — desactivar (Desactivar Plantilla/Desactivacion no borra el registro)', () => {
  it('el boton Desactivar llama a desactivarPlantilla con el id y el empresa_id de la plantilla', async () => {
    const user = userEvent.setup()
    mockedUsePlantillasTraspaso.mockReturnValue({ plantillas: PLANTILLAS, isLoading: false })
    render(<PlantillaList />)

    const desactivarButtons = screen.getAllByRole('button', { name: /desactivar/i })
    await user.click(desactivarButtons[0]!)

    await waitFor(() => {
      expect(mockedDesactivarPlantilla).toHaveBeenCalledWith('plant-1', 'emp-1')
    })
  })
})

describe('PlantillaList — dialog de creacion/edicion (Crear Plantilla, Editar Plantilla)', () => {
  it('el boton "Nueva Plantilla" abre el dialog en modo creacion', async () => {
    const user = userEvent.setup()
    mockedUsePlantillasTraspaso.mockReturnValue({ plantillas: PLANTILLAS, isLoading: false })
    render(<PlantillaList />)

    expect(screen.queryByTestId('plantilla-form-dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /nueva plantilla/i }))

    expect(screen.getByTestId('plantilla-form-dialog')).toHaveTextContent('Nueva plantilla')
  })

  it('el boton "Editar" abre el dialog en modo edicion con la plantilla correcta', async () => {
    const user = userEvent.setup()
    mockedUsePlantillasTraspaso.mockReturnValue({ plantillas: PLANTILLAS, isLoading: false })
    render(<PlantillaList />)

    const editarButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editarButtons[1]!)

    expect(screen.getByTestId('plantilla-form-dialog')).toHaveTextContent('Editando REPOSICION SEMANAL')
  })
})
