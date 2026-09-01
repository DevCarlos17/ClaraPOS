import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MovimientoForm } from '../movimiento-form'
import { useProductosTipo } from '@/features/inventario/hooks/use-productos'
import { registrarMovimiento } from '@/features/inventario/hooks/use-kardex'
import { useLotesPorProducto } from '@/features/inventario/hooks/use-lotes'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useUnidades } from '@/features/inventario/hooks/use-unidades'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'

// Cada `vi.mock(..., importOriginal)` de abajo carga el modulo REAL para
// preservar sus otros exports — pero esos modulos importan (transitivamente,
// via `useCurrentUser` -> `auth-provider`) el singleton REAL de
// `@/core/db/powersync/db`, que construye una `PowerSyncDatabase` real
// (efecto de modulo top-level) y revienta con "Worker is not defined" en
// el entorno de test. Mockeamos esos 3 modulos primero, mismo patron que
// use-productos.test.ts / use-kardex.test.ts.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

// Mockeamos cada hook de datos que consume `MovimientoForm` directamente (mismo
// patron que company-data-form.test.tsx) para poder controlar `productos`
// (con `deposito_id`) y `depositos` (con `es_principal`) sin levantar PowerSync real.
vi.mock('@/features/inventario/hooks/use-productos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-productos')>()
  return { ...actual, useProductosTipo: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-kardex', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-kardex')>()
  return { ...actual, registrarMovimiento: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-lotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-lotes')>()
  return { ...actual, useLotesPorProducto: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, useDepositosActivos: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-unidades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-unidades')>()
  return { ...actual, useUnidades: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))

const mockedUseProductosTipo = vi.mocked(useProductosTipo)
const mockedRegistrarMovimiento = vi.mocked(registrarMovimiento)
const mockedUseLotesPorProducto = vi.mocked(useLotesPorProducto)
const mockedUseDepositosActivos = vi.mocked(useDepositosActivos)
const mockedUseUnidades = vi.mocked(useUnidades)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseTasaActual = vi.mocked(useTasaActual)

const PRODUCTO_CON_DEPOSITO = {
  id: 'prod-1',
  codigo: 'P-001',
  nombre: 'Producto Con Deposito',
  stock: '10.000',
  maneja_lotes: 0,
  unidad_base_id: null,
  costo_usd: '5.00000000',
  deposito_id: 'dep-A',
}

const PRODUCTO_SIN_DEPOSITO = {
  id: 'prod-2',
  codigo: 'P-002',
  nombre: 'Producto Sin Deposito',
  stock: '3.000',
  maneja_lotes: 0,
  unidad_base_id: null,
  costo_usd: '2.00000000',
  deposito_id: null,
}

const DEPOSITOS = [
  { id: 'dep-A', nombre: 'Deposito A', es_principal: 0 },
  { id: 'dep-principal', nombre: 'Almacen Principal', es_principal: 1 },
]

function setupMocks(productos: (typeof PRODUCTO_CON_DEPOSITO | typeof PRODUCTO_SIN_DEPOSITO)[]) {
  mockedUseProductosTipo.mockReturnValue({ productos: productos as never, isLoading: false })
  mockedUseLotesPorProducto.mockReturnValue({ lotes: [], isLoading: false })
  mockedUseDepositosActivos.mockReturnValue({ depositos: DEPOSITOS as never, isLoading: false })
  mockedUseUnidades.mockReturnValue({ unidades: [], isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUseTasaActual.mockReturnValue({ tasaValor: 0 } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedRegistrarMovimiento.mockResolvedValue({ gastoCreado: false })
})

describe('MovimientoForm — deposito sugerido en ingreso manual (Slice 1c, KDS/Deposito Sugerido en Ingreso Manual)', () => {
  it('al seleccionar un producto CON deposito default en una ENTRADA, el selector de deposito queda pre-seleccionado a ese deposito', async () => {
    const user = userEvent.setup()
    setupMocks([PRODUCTO_CON_DEPOSITO])
    render(<MovimientoForm isOpen onClose={() => {}} />)

    await user.type(screen.getByLabelText(/producto/i), 'Producto Con')
    await user.click(await screen.findByText(/Producto Con Deposito/i))

    const selectDeposito = await screen.findByLabelText(/deposito/i) as HTMLSelectElement
    expect(selectDeposito.value).toBe('dep-A')
  })

  it('producto SIN deposito default: el selector cae al deposito principal de la empresa', async () => {
    const user = userEvent.setup()
    setupMocks([PRODUCTO_SIN_DEPOSITO])
    render(<MovimientoForm isOpen onClose={() => {}} />)

    await user.type(screen.getByLabelText(/producto/i), 'Producto Sin')
    await user.click(await screen.findByText(/Producto Sin Deposito/i))

    const selectDeposito = await screen.findByLabelText(/deposito/i) as HTMLSelectElement
    expect(selectDeposito.value).toBe('dep-principal')
  })

  it('el usuario sobreescribe la sugerencia antes de guardar: el movimiento se registra con el deposito elegido, NO el sugerido', async () => {
    const user = userEvent.setup()
    setupMocks([PRODUCTO_CON_DEPOSITO])
    render(<MovimientoForm isOpen onClose={() => {}} />)

    await user.type(screen.getByLabelText(/producto/i), 'Producto Con')
    await user.click(await screen.findByText(/Producto Con Deposito/i))

    const selectDeposito = await screen.findByLabelText(/deposito/i) as HTMLSelectElement
    expect(selectDeposito.value).toBe('dep-A')

    await user.selectOptions(selectDeposito, 'dep-principal')
    expect(selectDeposito.value).toBe('dep-principal')
    await user.type(screen.getByLabelText(/cantidad/i), '5')

    // `fireEvent.submit` (no `user.click` en el boton submit): happy-dom aplica
    // constraint-validation nativa sobre `step="0.001"` con precision de punto
    // flotante ANTES de disparar el evento "submit" (bloquea `5` como invalido
    // aunque sea un valor legitimo — quirk pre-existente del input, no
    // introducido por este slice). `fireEvent.submit` dispara el evento
    // directamente, saltando ese chequeo previo del navegador y ejercitando
    // el mismo `handleSubmit` de React.
    fireEvent.submit(screen.getByRole('button', { name: /registrar entrada/i }).closest('form')!)

    await waitFor(() => {
      expect(mockedRegistrarMovimiento).toHaveBeenCalled()
    })
    expect(mockedRegistrarMovimiento.mock.calls[0]![0]).toMatchObject({
      deposito_id: 'dep-principal',
    })
  })
})
