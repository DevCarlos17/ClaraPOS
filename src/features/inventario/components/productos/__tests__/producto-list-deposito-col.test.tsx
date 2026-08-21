import { render, screen, within } from '@testing-library/react'
import { ProductoList } from '../producto-list'
import { useProductos, useResumenInventario } from '@/features/inventario/hooks/use-productos'
import { useDepartamentos } from '@/features/inventario/hooks/use-departamentos'
import { useDepositos } from '@/features/inventario/hooks/use-depositos'
import { useTodasLasRecetas } from '@/features/inventario/hooks/use-recetas'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'

// Mismo patron que traspaso-form.test.tsx: cortamos la PowerSyncDatabase real
// (efecto top-level via `useCurrentUser` -> `auth-provider`) antes de que
// reviente con "Worker is not defined" en el entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/inventario/hooks/use-productos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-productos')>()
  return { ...actual, useProductos: vi.fn(), useResumenInventario: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-departamentos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-departamentos')>()
  return { ...actual, useDepartamentos: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, useDepositos: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-recetas', () => ({ useTodasLasRecetas: vi.fn() }))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))

// El form y los modales hijos arrastran su propio arbol de hooks (unidades,
// marcas, etc.) irrelevantes para la columna Deposito de la tabla — los
// stubeamos para aislar la lista.
vi.mock('../producto-form', () => ({ ProductoForm: () => null }))
vi.mock('../stock-critico-modal', () => ({ StockCriticoModal: () => null }))
vi.mock('../valor-inventario-modal', () => ({ ValorInventarioModal: () => null }))
vi.mock('../import-productos-modal', () => ({ ImportProductosModal: () => null }))
vi.mock('@/features/inventario/components/recetas/combo-detalle-modal', () => ({ ComboDetalleModal: () => null }))

const mockedUseProductos = vi.mocked(useProductos)
const mockedUseResumenInventario = vi.mocked(useResumenInventario)
const mockedUseDepartamentos = vi.mocked(useDepartamentos)
const mockedUseDepositos = vi.mocked(useDepositos)
const mockedUseTodasLasRecetas = vi.mocked(useTodasLasRecetas)
const mockedUseTasaActual = vi.mocked(useTasaActual)

const BASE_PRODUCTO = {
  tipo: 'P',
  is_active: 1,
  departamento_id: 'depto-1',
  costo_usd: '1.00',
  precio_venta_usd: '2.00',
  precio_mayor_usd: '1.50',
  stock: '10.000',
  stock_minimo: '1.000',
  codigo_barras: null,
  es_decimal: 0,
  unidad_id: 'uni-1',
  marca_id: null,
  empresa_id: 'emp-1',
}

const PRODUCTOS = [
  { ...BASE_PRODUCTO, id: 'prod-1', codigo: 'P-001', nombre: 'PRODUCTO CON DEPOSITO', deposito_id: 'dep-A' },
  { ...BASE_PRODUCTO, id: 'prod-2', codigo: 'P-002', nombre: 'PRODUCTO SIN DEPOSITO', deposito_id: null },
  { ...BASE_PRODUCTO, id: 'prod-3', codigo: 'P-003', nombre: 'PRODUCTO DEPOSITO INACTIVO', deposito_id: 'dep-OFF' },
]

// useDepositos() trae TODOS los depositos, incluidos los inactivos (is_active=0),
// para que un producto que apunta a un deposito desactivado igual muestre su nombre.
const DEPOSITOS = [
  { id: 'dep-A', nombre: 'DEPOSITO PRINCIPAL', es_principal: 1, permite_venta: 1, is_active: 1, empresa_id: 'emp-1' },
  { id: 'dep-OFF', nombre: 'DEPOSITO VIEJO', es_principal: 0, permite_venta: 0, is_active: 0, empresa_id: 'emp-1' },
]

function setupMocks() {
  mockedUseProductos.mockReturnValue({ productos: PRODUCTOS as never, isLoading: false })
  mockedUseResumenInventario.mockReturnValue({ valorTotal: 0, stockCritico: [] } as never)
  mockedUseDepartamentos.mockReturnValue({ departamentos: [{ id: 'depto-1', nombre: 'DEPTO UNO' }] as never, isLoading: false })
  mockedUseDepositos.mockReturnValue({ depositos: DEPOSITOS as never, isLoading: false })
  mockedUseTodasLasRecetas.mockReturnValue({ recetas: [] as never, isLoading: false })
  mockedUseTasaActual.mockReturnValue({ tasaValor: 40 } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  setupMocks()
})

describe('ProductoList — columna Deposito (Mejora 5)', () => {
  it('muestra el encabezado de columna "Deposito"', () => {
    render(<ProductoList />)
    expect(screen.getByRole('columnheader', { name: /^deposito$/i })).toBeInTheDocument()
  })

  it('resuelve deposito_id al nombre del deposito en la fila del producto', () => {
    render(<ProductoList />)
    const filaConDeposito = screen.getByText('PRODUCTO CON DEPOSITO').closest('tr')!
    expect(within(filaConDeposito).getByText('DEPOSITO PRINCIPAL')).toBeInTheDocument()
  })

  it('muestra "-" cuando el producto no tiene deposito configurado', () => {
    render(<ProductoList />)
    const filaSinDeposito = screen.getByText('PRODUCTO SIN DEPOSITO').closest('tr')!
    // La celda de deposito es la que sigue a la de departamento (DEPTO UNO).
    const celdas = within(filaSinDeposito).getAllByRole('cell')
    const idxDepto = celdas.findIndex((c) => c.textContent === 'DEPTO UNO')
    expect(celdas[idxDepto + 1]!.textContent).toBe('-')
  })

  it('muestra el nombre real aunque el deposito este desactivado (no "-")', () => {
    render(<ProductoList />)
    const filaInactivo = screen.getByText('PRODUCTO DEPOSITO INACTIVO').closest('tr')!
    expect(within(filaInactivo).getByText('DEPOSITO VIEJO')).toBeInTheDocument()
  })
})
