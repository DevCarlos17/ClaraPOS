import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductoForm } from '../producto-form'
import { crearProducto } from '@/features/inventario/hooks/use-productos'
import { useDepartamentosActivos } from '@/features/inventario/hooks/use-departamentos'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { useNivelesPrecioActivos } from '@/features/configuracion/hooks/use-niveles-precio'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCatalogoGlobal } from '@/features/inventario/hooks/use-catalogo-global'

// Mismo patron que producto-form-precio-precision-submit.test.tsx: cortamos la
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
  crearProducto: vi.fn().mockResolvedValue('producto-nuevo-id'),
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
const mockedCrearProducto = vi.mocked(crearProducto)

function setupMocks(tasaValor = 500) {
  mockedUseDepartamentosActivos.mockReturnValue({ departamentos: [{ id: 'depto-1', nombre: 'DEPTO UNO' }] as never, isLoading: false })
  mockedUseUnidadesActivas.mockReturnValue({ unidades: [] as never, isLoading: false })
  mockedUseDepositosActivos.mockReturnValue({ depositos: [{ id: 'dep-1', nombre: 'DEPOSITO PRINCIPAL' }] as never, isLoading: false })
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

async function abrirTabPrecios(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /precios y fiscalidad/i }))
}

async function completarIdentidadYDeposito(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  fireEvent.change(container.querySelector('#prod-codigo') as HTMLInputElement, { target: { value: 'PROD-001' } })
  fireEvent.change(container.querySelector('#prod-nombre') as HTMLInputElement, { target: { value: 'PRODUCTO DE PRUEBA' } })

  await user.click(screen.getByRole('button', { name: /informacion general/i }))
  await user.click(screen.getByRole('button', { name: /seleccionar departamento/i }))
  await user.click(screen.getByText('DEPTO UNO'))

  await user.click(screen.getByRole('button', { name: /^inventario$/i }))
  await user.click(screen.getByRole('button', { name: /seleccionar deposito/i }))
  await user.click(screen.getByText('DEPOSITO PRINCIPAL'))
}

// ============================================================
// REGRESSION NET — pinning today's cascade/back-calc behavior.
// Estas aserciones deben seguir dando exactamente los mismos valores
// despues de Fase 6 (widening de precision del Margen) — el ancho de
// precision NUEVO es adicional (ref + mascara visual), la formula de
// back-calc no cambia un bit.
// ============================================================
describe('REGRESSION NET — cascada costo+margen no cambia con el widening de precision del Margen', () => {
  it('margen 16.34% + costo 7 -> PVP Detal 8.14 (mostrado) y 8.1438 (submit)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '16.34' } })
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '7' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    expect(precioVentaUsd.value).toBe('8.14')

    await completarIdentidadYDeposito(user, container)
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    expect(enviado.precio_venta_usd).toBeCloseTo(8.1438, 4)
  })

  it('triangulacion: margen Detal 30% + margen Mayor 12.5% + costo 9 -> PVP Mayor 10.13 (mostrado) y 10.125 (submit)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '30' } })
    const margenMayor = screen.getAllByPlaceholderText('0')[1]!
    fireEvent.change(margenMayor, { target: { value: '12.5' } })

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '9' } })

    const precioMayorUsd = container.querySelector('#prod-mayor') as HTMLInputElement
    expect(precioMayorUsd.value).toBe('10.13')

    await completarIdentidadYDeposito(user, container)
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    expect(enviado.precio_mayor_usd).toBeCloseTo(10.125, 4)
  })

  it('tipear Precio Venta $ directo recalcula el Margen Detal mostrado (costo 10, venta 15 -> margen 50.00)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '15' } })

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    expect((margenDetal as HTMLInputElement).value).toBe('50.00')
  })

  it('"Fijar costo" cascada los 3 niveles desde sus margenes vigentes (costo 100, margenes 50/25/10 -> PVP 150.00/125.00/110.00)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    // Modo exploracion: sin costo tipeado, el sistema recalcula un preview de
    // costo desde el nivel Detal — evitamos ese camino tipeando el costo
    // primero para fijarlo directamente.
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '100' } })

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '50' } })
    const margenMayor = screen.getAllByPlaceholderText('0')[1]!
    fireEvent.change(margenMayor, { target: { value: '25' } })
    const margenEspecial = screen.getAllByPlaceholderText('0')[2]!
    fireEvent.change(margenEspecial, { target: { value: '10' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    const precioMayorUsd = container.querySelector('#prod-mayor') as HTMLInputElement
    const precioEspecialUsd = container.querySelector('#prod-especial') as HTMLInputElement

    expect(precioVentaUsd.value).toBe('150.00')
    expect(precioMayorUsd.value).toBe('125.00')
    expect(precioEspecialUsd.value).toBe('110.00')
  })
})

// ============================================================
// NUEVO COMPORTAMIENTO — mascara visual del Margen % (Fase 6)
// ============================================================
describe('ProductoForm — mascara visual Margen % (2 decimales/foco revela precision completa)', () => {
  it('Margen Detal calculado desde costo+venta: 2 decimales sin foco, precision completa al enfocar, remascara al perder foco', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    // costo 3, venta 10 -> margen = (10-3)/3*100 = 233.333333...%
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '3' } })
    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '10' } })

    const margenDetal = screen.getAllByPlaceholderText('0')[0]! as HTMLInputElement
    expect(margenDetal.value).toBe('233.33')

    // toFullDisplay redondea a 8 decimales (precision_calc, regla de negocio
    // #10), no a la representacion completa del float nativo de JS.
    fireEvent.focus(margenDetal)
    expect(margenDetal.value).toBe('233.33333333')

    fireEvent.blur(margenDetal)
    expect(margenDetal.value).toBe('233.33')
  })

  it('Margen tipeado directamente con mas de 2 decimales: se muestra tal cual mientras se tipea, se mascara al perder el foco y revela completo al reenfocar', async () => {
    const user = userEvent.setup()
    render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]! as HTMLInputElement
    fireEvent.change(margenDetal, { target: { value: '33.333333' } })
    expect(margenDetal.value).toBe('33.333333')

    fireEvent.blur(margenDetal)
    expect(margenDetal.value).toBe('33.33')

    fireEvent.focus(margenDetal)
    expect(margenDetal.value).toBe('33.333333')
  })

  it('un margen de precision completa (>2 decimales) participa correctamente en el calculo del PVP mientras se tipea', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '33.333333' } })

    // pvp = 10 * (1 + 33.333333/100) = 13.3333333 -> mostrado a 2 decimales.
    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    expect(precioVentaUsd.value).toBe('13.33')
  })

  it('aislamiento de foco: enfocar Margen Detal NO altera lo que muestra Precio Venta $, y viceversa', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '3' } })
    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '10' } })
    fireEvent.blur(precioVentaUsd)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]! as HTMLInputElement
    expect(margenDetal.value).toBe('233.33')
    expect(precioVentaUsd.value).toBe('10.00')

    fireEvent.focus(margenDetal)
    expect(precioVentaUsd.value).toBe('10.00')
    fireEvent.blur(margenDetal)

    fireEvent.focus(precioVentaUsd)
    expect(margenDetal.value).toBe('233.33')
  })
})
