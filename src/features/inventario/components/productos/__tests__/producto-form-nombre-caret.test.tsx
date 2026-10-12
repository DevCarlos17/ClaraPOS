import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductoForm } from '../producto-form'
import { useDepartamentosActivos } from '@/features/inventario/hooks/use-departamentos'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { useNivelesPrecioActivos } from '@/features/configuracion/hooks/use-niveles-precio'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCatalogoGlobal } from '@/features/inventario/hooks/use-catalogo-global'

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

beforeEach(() => {
  vi.clearAllMocks()
  setupMocks()
})

// Simula lo que hace el navegador al insertar un texto en una posicion
// concreta: escribe el valor nuevo mediante el setter nativo (para que React
// detecte el cambio), deja el cursor donde lo dejaria el navegador y dispara
// el evento input.
function insertarEnCursor(input: HTMLInputElement, nuevoValor: string, posicionCursor: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, nuevoValor)
  input.setSelectionRange(posicionCursor, posicionCursor)
  fireEvent.input(input)
}

describe('ProductoForm — campo nombre conserva la posicion del cursor al escribir en medio', () => {
  it('al escribir una letra en medio del nombre, el cursor queda justo despues de esa letra (no salta al final)', async () => {
    const user = userEvent.setup()
    render(<ProductoForm isOpen onClose={() => {}} />)

    const input = screen.getByPlaceholderText('Nombre del producto') as HTMLInputElement
    await user.type(input, 'ARROZ 900 GR')
    expect(input.value).toBe('ARROZ 900 GR')

    input.focus()
    insertarEnCursor(input, 'ARROZ m900 GR', 7)

    expect(input.value).toBe('ARROZ M900 GR')
    expect(input.selectionStart).toBe(7)
    expect(input.selectionEnd).toBe(7)
  })

  it('al escribir varias letras seguidas en medio, cada una entra en la posicion del cursor y el cursor avanza', async () => {
    const user = userEvent.setup()
    render(<ProductoForm isOpen onClose={() => {}} />)

    const input = screen.getByPlaceholderText('Nombre del producto') as HTMLInputElement
    await user.type(input, 'ARROZ 900 GR')

    input.focus()
    insertarEnCursor(input, 'ARROZ m900 GR', 7)
    insertarEnCursor(input, 'ARROZ Ma900 GR', 8)
    insertarEnCursor(input, 'ARROZ Mar900 GR', 9)

    expect(input.value).toBe('ARROZ MAR900 GR')
    expect(input.selectionStart).toBe(9)
  })

  it('al escribir una letra al inicio del nombre, el cursor queda despues de esa letra', async () => {
    const user = userEvent.setup()
    render(<ProductoForm isOpen onClose={() => {}} />)

    const input = screen.getByPlaceholderText('Nombre del producto') as HTMLInputElement
    await user.type(input, 'ARROZ 900 GR')

    input.focus()
    insertarEnCursor(input, 'xARROZ 900 GR', 1)

    expect(input.value).toBe('XARROZ 900 GR')
    expect(input.selectionStart).toBe(1)
  })
})
