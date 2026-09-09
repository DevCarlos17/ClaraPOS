import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductoForm } from '../producto-form'
import { saveDraft, type ProductoFormDraft } from '@/features/inventario/lib/producto-form-draft'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import { useDepartamentosActivos } from '@/features/inventario/hooks/use-departamentos'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { useNivelesPrecioActivos } from '@/features/configuracion/hooks/use-niveles-precio'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCatalogoGlobal } from '@/features/inventario/hooks/use-catalogo-global'

// Mismo patron que producto-form-costo-direct-write.test.tsx: cortamos la
// PowerSyncDatabase real (efecto top-level via `useCurrentUser` ->
// `auth-provider`) antes de que reviente con "Worker is not defined".
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))
vi.mock('@powersync/react', () => ({ useQuery: vi.fn(() => ({ data: [] })) }))

vi.mock('@/features/inventario/hooks/use-departamentos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-departamentos')>()
  return { ...actual, useDepartamentosActivos: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-unidades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-unidades')>()
  return { ...actual, useUnidadesActivas: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, useDepositosActivos: vi.fn() }
})
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))
vi.mock('@/features/configuracion/hooks/use-impuestos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/configuracion/hooks/use-impuestos')>()
  return { ...actual, useImpuestosActivos: vi.fn() }
})
vi.mock('@/features/configuracion/hooks/use-niveles-precio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/configuracion/hooks/use-niveles-precio')>()
  return { ...actual, useNivelesPrecioActivos: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/features/inventario/hooks/use-catalogo-global', () => ({ useCatalogoGlobal: vi.fn() }))
vi.mock('@/features/inventario/hooks/use-productos', () => ({
  crearProducto: vi.fn(),
  actualizarProducto: vi.fn(),
}))

const mockedUseDepartamentosActivos = vi.mocked(useDepartamentosActivos)
const mockedUseUnidadesActivas = vi.mocked(useUnidadesActivas)
const mockedUseDepositosActivos = vi.mocked(useDepositosActivos)
const mockedUseTasaActual = vi.mocked(useTasaActual)
const mockedUseImpuestosActivos = vi.mocked(useImpuestosActivos)
const mockedUseNivelesPrecioActivos = vi.mocked(useNivelesPrecioActivos)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseCatalogoGlobal = vi.mocked(useCatalogoGlobal)

function setupMocks(tasaValor = 40) {
  mockedUseDepartamentosActivos.mockReturnValue({ departamentos: [{ id: 'depto-1', nombre: 'DEPTO UNO' }] as never, isLoading: false })
  mockedUseUnidadesActivas.mockReturnValue({ unidades: [] as never, isLoading: false })
  mockedUseDepositosActivos.mockReturnValue({ depositos: [] as never, isLoading: false })
  mockedUseTasaActual.mockReturnValue({ tasaValor } as never)
  mockedUseImpuestosActivos.mockReturnValue({ impuestos: [] as never, isLoading: false })
  mockedUseNivelesPrecioActivos.mockReturnValue({ niveles: [] as never, isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUseCatalogoGlobal.mockReturnValue({ sugerencias: [] as never, isLoading: false })
}

function makeDraft(overrides: Partial<ProductoFormDraft> = {}): ProductoFormDraft {
  return {
    codigo: 'DRAFT-1',
    tipo: 'P',
    nombre: 'Producto Borrador',
    departamentoId: '',
    unidadBaseId: '',
    presentacion: '',
    stockMinimo: '',
    codigoBarras: '',
    isActive: true,
    duracionMin: null,
    costoUsd: '',
    precioVentaUsd: '',
    precioMayorUsd: '',
    precioEspecialUsd: '',
    margen: '',
    margenMayor: '',
    margenEspecial: '',
    tipoImpuesto: 'Exento',
    impuestoIvaId: '',
    ubicacion: '',
    manejaLotes: false,
    depositoId: '',
    stockInicial: '',
    activeTab: 'general',
    ...overrides,
  }
}

function makeProducto(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'prod-1',
    codigo: 'EXIST-1',
    tipo: 'P',
    nombre: 'Producto Existente',
    departamento_id: 'depto-1',
    marca_id: null,
    unidad_base_id: null,
    costo_usd: '5',
    precio_venta_usd: '10',
    precio_mayor_usd: null,
    precio_especial_usd: null,
    costo_promedio: '5',
    costo_ultimo: '5',
    stock: '0',
    stock_minimo: '0',
    tipo_impuesto: 'Exento',
    impuesto_iva_id: null,
    maneja_lotes: 0,
    is_active: 1,
    created_at: '',
    updated_at: '',
    ubicacion: null,
    presentacion: null,
    codigo_barras: null,
    duracion_min: null,
    deposito_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setupMocks()
  localStorage.clear()
})

describe('ProductoForm — aviso de borrador recuperado (dialog anidado)', () => {
  it('al reabrir en modo alta con un borrador guardado, muestra un dialog centrado con "Entendido" y el form restaurado debajo', () => {
    saveDraft(localStorage, 'emp-1', makeDraft({ codigo: 'DRAFT-1', nombre: 'Producto Borrador' }))

    render(<ProductoForm isOpen onClose={() => {}} />)

    expect(screen.getByText(/datos recuperados/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entendido/i })).toBeInTheDocument()
    // El form subyacente ya muestra el valor restaurado del borrador.
    expect(screen.getByDisplayValue('DRAFT-1')).toBeInTheDocument()
  })

  it('clickear "Entendido" cierra SOLO el aviso — el modal de producto y sus datos restaurados siguen presentes', async () => {
    const user = userEvent.setup()
    saveDraft(localStorage, 'emp-1', makeDraft({ codigo: 'DRAFT-1', nombre: 'Producto Borrador' }))

    render(<ProductoForm isOpen onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /entendido/i }))

    expect(screen.queryByText(/datos recuperados/i)).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('DRAFT-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear/i })).toBeInTheDocument()
  })

  it('NO muestra el aviso al abrir un formulario nuevo sin borrador guardado', () => {
    render(<ProductoForm isOpen onClose={() => {}} />)
    expect(screen.queryByText(/datos recuperados/i)).not.toBeInTheDocument()
  })

  it('NO muestra el aviso en modo edicion aunque exista un borrador de otra sesion en storage', () => {
    saveDraft(localStorage, 'emp-1', makeDraft({ codigo: 'DRAFT-1' }))

    render(<ProductoForm isOpen onClose={() => {}} producto={makeProducto()} />)

    expect(screen.queryByText(/datos recuperados/i)).not.toBeInTheDocument()
  })
})
