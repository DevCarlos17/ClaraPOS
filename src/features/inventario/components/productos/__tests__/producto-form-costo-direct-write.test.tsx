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

// Mismo patron que traspaso-form.test.tsx / movimiento-form.test.tsx: cortamos
// la PowerSyncDatabase real (efecto top-level via `useCurrentUser` ->
// `auth-provider`) antes de que reviente con "Worker is not defined" en el
// entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

// `producto-form.tsx` hace 2 queries directas via `useQuery` de `@powersync/react`
// (lotes, ultimo producto) — ninguna es relevante para el direct-write de PVP.
vi.mock('@powersync/react', () => ({ useQuery: vi.fn(() => ({ data: [] })) }))

// Cada hook de datos que consume `ProductoForm` se mockea directamente (mismo
// patron que movimiento-form.test.tsx/traspaso-form.test.tsx) para aislar el
// formulario sin levantar PowerSync real.
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
  // niveles vacio -> el componente cae al fallback NIVELES_DEFAULT (Detal/Mayor/Especial, 0%).
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

describe('ProductoForm — Costo escribe el PVP directamente (elimina proyeccion "Aplicar")', () => {
  it('editar el Costo con un margen Detal configurado escribe el PVP Detal directamente (USD y Bs), sin hint de proyeccion', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '50' } })

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    const precioVentaBs = precioVentaUsd.closest('tr')!.querySelectorAll('td')[3]!.querySelector('input') as HTMLInputElement

    // 10 * (1 + 50/100) = 15.00 USD -> 15 * 40 = 600.00 Bs (tasaValor=40).
    expect(precioVentaUsd.value).toBe('15.00')
    expect(precioVentaBs.value).toBe('600.00')

    // El hint de proyeccion ("PVP cambiaria...") y el boton "Aplicar" ya no existen.
    expect(screen.queryByText(/pvp cambiar/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /aplicar/i })).not.toBeInTheDocument()
  })

  it('triangulacion: nivel Mayor con otro costo/margen escribe su propio PVP (formula real, no hardcodeada)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenMayor = screen.getAllByPlaceholderText('0')[1]!
    fireEvent.change(margenMayor, { target: { value: '25' } })

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const precioMayorUsd = container.querySelector('#prod-mayor') as HTMLInputElement
    // 10 * (1 + 25/100) = 12.50 USD.
    expect(precioMayorUsd.value).toBe('12.50')

    // El Detal (sin margen configurado) no se toca por el direct-write del nivel Mayor.
    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    expect(precioVentaUsd.value).toBe('')
  })

  it('margen vacio/0 en un nivel: al editar el Costo, ese nivel sigue recalculando el margen desde el precio existente (fallback intacto)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    // Precio Venta Detal ya tiene un valor tipeado a mano, margen Detal queda vacio (0 efectivo).
    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '20' } })

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    // (20 - 10) / 10 * 100 = 100.00 -> el margen se recalcula, el PVP tipeado (20) no se pisa.
    expect((margenDetal as HTMLInputElement).value).toBe('100.00')
    expect(precioVentaUsd.value).toBe('20')
  })

  it('regresion: editar el Margen sigue escribiendo el PVP directamente (comportamiento no tocado por este cambio)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '50' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    expect(precioVentaUsd.value).toBe('15.00')
  })
})
