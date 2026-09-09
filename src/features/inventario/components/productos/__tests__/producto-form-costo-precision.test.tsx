import Decimal from 'decimal.js'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Cortamos la PowerSyncDatabase real (efecto top-level en `producto-form.tsx`
// via `db.ts` -> `new PowerSyncDatabase(...)`) antes de que reviente con
// "Worker is not defined" en el entorno de test. Mismo patron que
// producto-list-deposito-col.test.tsx. Estos mocks son solo para permitir el
// import del modulo — las funciones bajo test son puras y no los usan.
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

import {
  formatearCostoExploradoParaEstado,
  resolverPvpCascadaStrings,
  ProductoForm,
} from '../producto-form'
import { crearProducto } from '@/features/inventario/hooks/use-productos'
import { useDepartamentosActivos } from '@/features/inventario/hooks/use-departamentos'
import { useUnidadesActivas } from '@/features/inventario/hooks/use-unidades'
import { useDepositosActivos } from '@/features/inventario/hooks/use-depositos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useImpuestosActivos } from '@/features/configuracion/hooks/use-impuestos'
import { useNivelesPrecioActivos } from '@/features/configuracion/hooks/use-niveles-precio'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCatalogoGlobal } from '@/features/inventario/hooks/use-catalogo-global'

const mockedUseDepartamentosActivos = vi.mocked(useDepartamentosActivos)
const mockedUseUnidadesActivas = vi.mocked(useUnidadesActivas)
const mockedUseDepositosActivos = vi.mocked(useDepositosActivos)
const mockedUseTasaActual = vi.mocked(useTasaActual)
const mockedUseImpuestosActivos = vi.mocked(useImpuestosActivos)
const mockedUseNivelesPrecioActivos = vi.mocked(useNivelesPrecioActivos)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseCatalogoGlobal = vi.mocked(useCatalogoGlobal)
const mockedCrearProducto = vi.mocked(crearProducto)

function setupMocks(tasaValor = 40) {
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

describe('formatearCostoExploradoParaEstado', () => {
  it('preserva 8 decimales (regla de negocio #10) en vez de redondear a 2 (caso del tester: 104 Bs / tasa 500)', () => {
    const costo = new Decimal(104).dividedBy(new Decimal(500))
    expect(formatearCostoExploradoParaEstado(costo)).toBe('0.20800000')
  })

  it('redondea a 8 decimales cuando el costo tiene mas precision aun (triangulacion)', () => {
    const costo = new Decimal(100).dividedBy(new Decimal(3))
    expect(formatearCostoExploradoParaEstado(costo)).toBe('33.33333333')
  })
})

describe('resolverPvpCascadaStrings', () => {
  it('deriva el Bs del Decimal de precision completa, no del string USD ya redondeado (caso del tester: costo 0.208, margen especial 10%, tasa 500 -> 114.40 Bs, no 115.00)', () => {
    const costoUsd = new Decimal(104).dividedBy(new Decimal(500)) // 0.208
    const pvpEspecial = costoUsd.times(new Decimal(1).plus(new Decimal(10).dividedBy(100))) // 0.2288
    const { usdStr, bsStr } = resolverPvpCascadaStrings(pvpEspecial, 500)
    expect(usdStr).toBe('0.23')
    expect(bsStr).toBe('114.40')
  })

  it('triangula con otro nivel/margen (detal 30%, tasa 500 -> 135.20 Bs, no 135.00)', () => {
    const costoUsd = new Decimal(104).dividedBy(new Decimal(500)) // 0.208
    const pvpDetal = costoUsd.times(new Decimal(1).plus(new Decimal(30).dividedBy(100))) // 0.2704
    const { usdStr, bsStr } = resolverPvpCascadaStrings(pvpDetal, 500)
    expect(usdStr).toBe('0.27')
    expect(bsStr).toBe('135.20')
  })

  it('retorna bsStr null cuando la tasa es 0 (guard, sin escribir un Bs invalido)', () => {
    const pvp = new Decimal(0.23)
    expect(resolverPvpCascadaStrings(pvp, 0)).toEqual({ usdStr: '0.23', bsStr: null })
  })
})

describe('ProductoForm — mascara visual Costo (USD) (2 decimales/foco revela precision completa)', () => {
  it('Costo (USD): 2 decimales sin foco, precision completa al enfocar, remascara al perder foco', async () => {
    const user = userEvent.setup()
    render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.change(costoInput, { target: { value: '7.123456' } })
    fireEvent.blur(costoInput)
    expect(costoInput.value).toBe('7.12')

    fireEvent.focus(costoInput)
    expect(costoInput.value).toBe('7.123456')

    fireEvent.blur(costoInput)
    expect(costoInput.value).toBe('7.12')
  })

  it('triangulacion: otro valor de costo con distinta cantidad de decimales sigue el mismo ciclo mascara/foco/blur', async () => {
    const user = userEvent.setup()
    render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.change(costoInput, { target: { value: '12.5' } })
    fireEvent.blur(costoInput)
    expect(costoInput.value).toBe('12.50')

    fireEvent.focus(costoInput)
    expect(costoInput.value).toBe('12.5')

    fireEvent.blur(costoInput)
    expect(costoInput.value).toBe('12.50')
  })
})

describe('ProductoForm — submit envia costo_usd con precision completa', () => {
  it('el submit envia costo_usd con precision completa aunque el campo se haya mascarado tras perder el foco', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.change(costoInput, { target: { value: '1.23456789' } })
    fireEvent.blur(costoInput)
    // Display ya mascarado a 2 decimales — el submit NO debe leer este string.
    expect(costoInput.value).toBe('1.23')

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '5' } })

    await completarIdentidadYDeposito(user, container)
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    expect(enviado.costo_usd).toBeCloseTo(1.23456789, 6)
  })

  it('triangulacion: el submit envia costo_usd completo tambien cuando el campo nunca fue enfocado', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.change(costoInput, { target: { value: '3.14159265' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '9' } })

    await completarIdentidadYDeposito(user, container)
    await user.click(screen.getByRole('button', { name: 'Crear' }))

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    expect(enviado.costo_usd).toBeCloseTo(3.14159265, 6)
  })
})

describe('ProductoForm — boton Crear no se deshabilita por un costo real que mascara a "0.00"', () => {
  it('costo real 0.003 (mascara a "0.00" al perder foco) no deshabilita el boton Crear', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    fireEvent.change(container.querySelector('#prod-codigo') as HTMLInputElement, { target: { value: 'PROD-002' } })
    fireEvent.change(container.querySelector('#prod-nombre') as HTMLInputElement, { target: { value: 'PRODUCTO DE PRUEBA 2' } })

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.change(costoInput, { target: { value: '0.003' } })
    fireEvent.blur(costoInput)
    // El display se mascara a 2 decimales — sigue siendo el bug si el gate lee este string.
    expect(costoInput.value).toBe('0.00')

    expect(screen.getByRole('button', { name: 'Crear' })).not.toBeDisabled()
  })

  it('triangulacion: costo vacio SI sigue deshabilitando el boton Crear (semantica del gate preservada)', () => {
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)

    fireEvent.change(container.querySelector('#prod-codigo') as HTMLInputElement, { target: { value: 'PROD-003' } })
    fireEvent.change(container.querySelector('#prod-nombre') as HTMLInputElement, { target: { value: 'PRODUCTO DE PRUEBA 3' } })

    expect(screen.getByRole('button', { name: 'Crear' })).toBeDisabled()
  })
})

describe('ProductoForm — modo exploracion de costo no se rompe por la mascara', () => {
  it('el costo back-calculado en modo exploracion se muestra mascarado a 2 decimales, sin romper el badge de preview', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '20' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '12' } })

    // costo = 12 / 1.2 = 10 exacto -> preview del sistema, mascarado a 2 decimales.
    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    expect(costoInput.value).toBe('10.00')
    expect(screen.getByText(/costo recalculado por el sistema/i)).toBeInTheDocument()
  })
})
