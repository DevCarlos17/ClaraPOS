import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductoForm } from '../producto-form'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import { actualizarProducto } from '@/features/inventario/hooks/use-productos'
import { useDepartamentosActivos } from '@/features/inventario/hooks/use-departamentos'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { useNivelesPrecioActivos } from '@/features/configuracion/hooks/use-niveles-precio'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCatalogoGlobal } from '@/features/inventario/hooks/use-catalogo-global'

// Mismo patron que producto-form-costo-precision.test.tsx: cortamos la
// PowerSyncDatabase real antes de que reviente con "Worker is not defined".
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
  actualizarProducto: vi.fn().mockResolvedValue(undefined),
}))

const mockedUseDepartamentosActivos = vi.mocked(useDepartamentosActivos)
const mockedUseUnidadesActivas = vi.mocked(useUnidadesActivas)
const mockedUseDepositosActivos = vi.mocked(useDepositosActivos)
const mockedUseTasaActual = vi.mocked(useTasaActual)
const mockedUseImpuestosActivos = vi.mocked(useImpuestosActivos)
const mockedUseNivelesPrecioActivos = vi.mocked(useNivelesPrecioActivos)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseCatalogoGlobal = vi.mocked(useCatalogoGlobal)
const mockedActualizarProducto = vi.mocked(actualizarProducto)

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
    deposito_id: 'dep-1',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setupMocks()
})

async function abrirTabPrecios(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /precios y fiscalidad/i }))
}

describe('ProductoForm — modo edicion abre con la mascara aplicada (caso confirmado por tester)', () => {
  it('costo_usd="1.00000000" y precio_venta_usd="2.69004000" (strings crudos de 8 decimales de la DB) se muestran mascarados a 2 decimales al abrir, SIN necesidad de foco/blur', async () => {
    const user = userEvent.setup()
    const producto = makeProducto({ costo_usd: '1.00000000', precio_venta_usd: '2.69004000' })
    const { container } = render(<ProductoForm isOpen onClose={() => {}} producto={producto} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    const ventaInput = container.querySelector('#prod-venta') as HTMLInputElement

    // Bug reportado por el tester: sin este fix, el display muestra el string
    // crudo de la DB ("1.00000000"/"2.69004000") hasta el primer focus/blur.
    expect(costoInput.value).toBe('1.00')
    expect(ventaInput.value).toBe('2.69')
  })

  it('triangulacion: el foco revela la precision completa y el blur vuelve a mascarar (el companion de precision completa no se pierde)', async () => {
    const user = userEvent.setup()
    const producto = makeProducto({ costo_usd: '1.00000000', precio_venta_usd: '2.69004000' })
    const { container } = render(<ProductoForm isOpen onClose={() => {}} producto={producto} />)
    await abrirTabPrecios(user)

    const ventaInput = container.querySelector('#prod-venta') as HTMLInputElement
    expect(ventaInput.value).toBe('2.69')

    fireEvent.focus(ventaInput)
    expect(ventaInput.value).toBe('2.69004')

    fireEvent.blur(ventaInput)
    expect(ventaInput.value).toBe('2.69')
  })

  it('el submit conserva la precision completa (2.69004) aunque el campo nunca haya sido enfocado', async () => {
    const user = userEvent.setup()
    const producto = makeProducto({ costo_usd: '1.00000000', precio_venta_usd: '2.69004000' })
    render(<ProductoForm isOpen onClose={() => {}} producto={producto} />)
    await abrirTabPrecios(user)

    await user.click(screen.getByRole('button', { name: /actualizar/i }))

    await waitFor(() => expect(mockedActualizarProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedActualizarProducto.mock.calls[0]![1]
    expect(enviado.precio_venta_usd).toBeCloseTo(2.69004, 6)
    expect(enviado.costo_usd).toBeCloseTo(1, 6)
  })
})
