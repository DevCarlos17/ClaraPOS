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
  mockedUseImpuestosActivos.mockReturnValue({
    impuestos: [
      {
        id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        empresa_id: 'emp-1',
        nombre: 'IVA General',
        tipo_tributo: 'IVA',
        porcentaje: '16.00',
        codigo_seniat: null,
        descripcion: null,
        is_active: 1,
        created_at: '',
        updated_at: '',
        updated_by: null,
      },
    ] as never,
    isLoading: false,
  })
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

describe('ProductoForm — el submit envia precios con precision completa (8 decimales), no truncados a 2', () => {
  it('margen+costo (Detal): el PVP calculado con decimales mas alla de 2 se envia completo, no redondeado a 2 y re-parseado', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    // margen 16.34%, costo 7 -> pvp = 7 * 1.1634 = 8.1438 (NO es exacto a 2 decimales).
    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '16.34' } })

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '7' } })

    // El input sigue mostrando el valor redondeado a 2 decimales (UX sin cambios).
    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    expect(precioVentaUsd.value).toBe('8.14')

    await completarIdentidadYDeposito(user, container)
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    // Precision completa: 8.1438, NO 8.14 (lo que se enviaria si el submit
    // leyera el string ya truncado del input).
    expect(enviado.precio_venta_usd).toBeCloseTo(8.1438, 4)
  })

  it('triangulacion — margen+costo (Mayor): otro nivel/valores, formula real (no hardcodeada)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    // margen Detal 30% (mayor que el margen Mayor, para que precio_mayor_usd
    // <= precio_venta_usd y pase el refine del schema) + margen Mayor 12.5%,
    // costo 9 -> pvp Mayor = 9 * 1.125 = 10.125 (NO es exacto a 2 decimales).
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

  it('precio final (IVA) back-calcula la base con precision completa, no la version redondeada a 2', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    // Activar Gravable + tasa IVA 16%.
    await user.click(document.getElementById('prod-tipo-impuesto')!)
    await user.click(screen.getByText('Gravable (IVA General)'))
    await user.click(document.getElementById('prod-impuesto-iva')!)
    await user.click(screen.getByText('IVA General (16.00%)'))

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    const filaDetal = precioVentaUsd.closest('tr')!
    const precioFinalUsdInput = filaDetal.querySelectorAll('input')[3] as HTMLInputElement

    // Precio Final 100 / 1.16 = 86.2068965517... (base imponible), NO exacto a 2 decimales.
    fireEvent.change(precioFinalUsdInput, { target: { value: '100' } })
    expect(precioVentaUsd.value).toBe('86.21')

    await completarIdentidadYDeposito(user, container)
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    expect(enviado.precio_venta_usd).toBeCloseTo(86.20689655172414, 6)
  })
})

describe('ProductoForm — mascara visual Precio Venta $/Bs (2 decimales/foco revela precision completa)', () => {
  it('Precio Venta $ (Detal): 2 decimales sin foco, precision completa al enfocar, remascara al perder foco', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    // margen 16.34%, costo 7 -> pvp = 8.1438 (no exacto a 2 decimales).
    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '16.34' } })
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '7' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    expect(precioVentaUsd.value).toBe('8.14')

    fireEvent.focus(precioVentaUsd)
    expect(precioVentaUsd.value).toBe('8.1438')

    fireEvent.blur(precioVentaUsd)
    expect(precioVentaUsd.value).toBe('8.14')
  })

  it('triangulacion — Precio Venta $ (Mayor): mismo ciclo mascara/foco/blur con otro nivel y otros valores', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    // margen Detal 30% + margen Mayor 12.5%, costo 9 -> pvp Mayor = 10.125.
    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '30' } })
    const margenMayor = screen.getAllByPlaceholderText('0')[1]!
    fireEvent.change(margenMayor, { target: { value: '12.5' } })
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '9' } })

    const precioMayorUsd = container.querySelector('#prod-mayor') as HTMLInputElement
    expect(precioMayorUsd.value).toBe('10.13')

    fireEvent.focus(precioMayorUsd)
    expect(precioMayorUsd.value).toBe('10.125')

    fireEvent.blur(precioMayorUsd)
    expect(precioMayorUsd.value).toBe('10.13')
  })

  it('Precio Venta Bs (Detal): deriva precision completa desde el ref USD + tasa al enfocar, remascara al perder foco', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '16.34' } })
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '7' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    const filaDetal = precioVentaUsd.closest('tr')!
    const precioVentaBs = filaDetal.querySelectorAll('input')[2] as HTMLInputElement

    // pvp 8.1438 * tasa 500 = 4071.90 (masked mostrado por el calculo, sin foco).
    expect(precioVentaBs.value).toBe('4071.90')

    fireEvent.focus(precioVentaBs)
    expect(precioVentaBs.value).toBe('4071.9')

    fireEvent.blur(precioVentaBs)
    expect(precioVentaBs.value).toBe('4071.90')
  })

  it('aislamiento de foco: enfocar Precio Venta Bs NO altera lo que muestra Precio Venta $', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '16.34' } })
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '7' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    const filaDetal = precioVentaUsd.closest('tr')!
    const precioVentaBs = filaDetal.querySelectorAll('input')[2] as HTMLInputElement

    expect(precioVentaUsd.value).toBe('8.14')

    fireEvent.focus(precioVentaBs)
    expect(precioVentaUsd.value).toBe('8.14')
  })

  it('bug de parpadeo corregido: tipear en Precio Venta Bs actualiza Precio Venta $ ya mascarado a 2 decimales, no sin formatear', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '16.34' } })
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '7' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    const filaDetal = precioVentaUsd.closest('tr')!
    const precioVentaBs = filaDetal.querySelectorAll('input')[2] as HTMLInputElement

    // 4321.37 Bs / 500 = 8.64274 USD (5 decimales) — antes del fix se mostraba
    // sin formatear ("8.64274000"), ahora debe quedar mascarado a 2 decimales.
    fireEvent.change(precioVentaBs, { target: { value: '4321.37' } })
    expect(precioVentaUsd.value).toBe('8.64')
  })

  it('el submit envia precision completa aunque el campo haya pasado por un ciclo foco/blur', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '16.34' } })
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '7' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.focus(precioVentaUsd)
    expect(precioVentaUsd.value).toBe('8.1438')
    fireEvent.blur(precioVentaUsd)
    expect(precioVentaUsd.value).toBe('8.14')

    await completarIdentidadYDeposito(user, container)
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    expect(enviado.precio_venta_usd).toBeCloseTo(8.1438, 4)
  })
})
