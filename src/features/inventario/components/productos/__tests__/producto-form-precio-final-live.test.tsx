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
  // 1 tasa IVA activa al 16% — necesaria para activar showIvaCols (columnas
  // IVA/Precio Final) que son el objeto de este test.
  mockedUseImpuestosActivos.mockReturnValue({
    impuestos: [
      {
        id: 'iva-16',
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

describe('ProductoForm — Precio Final (IVA) recalcula LIVE en cada tecla', () => {
  async function activarGravableConTasa(user: ReturnType<typeof userEvent.setup>) {
    // SearchSelect "Tipo de Impuesto" -> Gravable
    await user.click(document.getElementById('prod-tipo-impuesto')!)
    await user.click(screen.getByText('Gravable (IVA General)'))

    // SearchSelect "Tasa IVA" -> IVA General (16.00%)
    await user.click(document.getElementById('prod-impuesto-iva')!)
    await user.click(screen.getByText('IVA General (16.00%)'))
  }

  it('escribir en Precio Final Detal recalcula PVP/Bs SIN blur (live, cada tecla)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarGravableConTasa(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '100' } })

    const filaDetal = precioVentaUsd.closest('tr')!
    const inputsDetal = filaDetal.querySelectorAll('input')
    const precioFinalUsdInput = inputsDetal[3] as HTMLInputElement
    const precioFinalBsInput = inputsDetal[4] as HTMLInputElement

    // 100 + 16% = 116.00 USD -> 116 * 40 = 4640.00 Bs (sync inicial, sin interaccion).
    expect(precioFinalUsdInput.value).toBe('116.00')
    expect(precioFinalBsInput.value).toBe('4640.00')

    // El usuario ENFOCA y escribe SIN salir del input (sin blur).
    fireEvent.focus(precioFinalUsdInput)
    fireEvent.change(precioFinalUsdInput, { target: { value: '100.01' } })

    // LIVE: el PVP base se recalcula inmediatamente (100.01 / 1.16 = 86.2155... -> 86.22),
    // sin necesidad de blur.
    expect(precioVentaUsd.value).toBe('86.22')

    // NO-JUMP: mientras el input esta enfocado, el sync effect NO le pisa el valor
    // tipeado por el usuario aunque el round-trip (86.22 * 1.16 = 100.0152 -> 100.02)
    // difiera en un centavo del valor tipeado (100.01).
    expect(precioFinalUsdInput.value).toBe('100.01')

    // El campo hermano (Bs), que NO esta siendo tipeado, SI se sincroniza live
    // reflejando el nuevo Precio Final derivado ((86.22 * 1.16 = 100.0152) * 40 = 4000.608 -> 4000.61).
    expect(precioFinalBsInput.value).toBe('4000.61')

    // Al salir del campo (blur), el sync effect retoma el control y muestra el
    // valor redondeado real del round-trip (bidireccional: precioVenta -> precioFinal).
    fireEvent.blur(precioFinalUsdInput)
    expect(precioFinalUsdInput.value).toBe('100.02')
  })

  it('editar el Margen (bidireccional) actualiza el Precio Final mostrado sin que el usuario toque ese input', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarGravableConTasa(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '50' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    // 10 * 1.5 = 15.00 PVP -> Precio Final = 15 * 1.16 = 17.40.
    expect(precioVentaUsd.value).toBe('15.00')

    const filaDetal = precioVentaUsd.closest('tr')!
    const precioFinalUsdInput = filaDetal.querySelectorAll('input')[3] as HTMLInputElement
    expect(precioFinalUsdInput.value).toBe('17.40')
  })
})
