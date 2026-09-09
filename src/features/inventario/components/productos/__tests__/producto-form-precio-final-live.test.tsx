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
    // reflejando el nuevo Precio Final derivado. Se deriva del PVP de
    // PRECISION COMPLETA (86.21551724137932, el ref sin redondear que guarda
    // `precioVentaUsdFullRef`), NO del string ya redondeado a 2 decimales
    // ("86.22") — ese era el bug de float espurio (Float Audit item #2,
    // fix de Phase 4). (86.21551724137932 * 1.16 = 100.0100000000000112) *
    // 40 = 4000.400000000000448 -> 4000.40.
    expect(precioFinalBsInput.value).toBe('4000.40')

    // Al salir del campo (blur), el sync effect retoma el control y muestra
    // el valor real derivado del ref de precision completa. Con el fix, el
    // round-trip Precio Final -> base -> Precio Final YA NO deriva un
    // centavo por redondeo (antes del fix daba "100.02" porque la formula
    // partia del string truncado a 2 decimales, amplificando el error).
    fireEvent.blur(precioFinalUsdInput)
    expect(precioFinalUsdInput.value).toBe('100.01')
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

describe('ProductoForm — mascara visual Precio Final (foco revela precision completa, fix IVA stray-float)', () => {
  async function activarGravableConTasa(user: ReturnType<typeof userEvent.setup>) {
    await user.click(document.getElementById('prod-tipo-impuesto')!)
    await user.click(screen.getByText('Gravable (IVA General)'))
    await user.click(document.getElementById('prod-impuesto-iva')!)
    await user.click(screen.getByText('IVA General (16.00%)'))
  }

  it('Precio Final Detal $/Bs: masca 2 decimales, revela precision completa al enfocar, remasca al perder foco — y prueba el fix del stray-float de IVA', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarGravableConTasa(user)

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    // 8 decimales reales — el ref de precision completa preserva el valor
    // tipeado exacto (precioVentaUsdFullRef = 33.33333333).
    fireEvent.change(precioVentaUsd, { target: { value: '33.33333333' } })
    // Blur: el display de Precio Venta $ se masca a 2 decimales, pero el ref
    // de precision completa (usado por la derivacion de Precio Final) NO se
    // trunca — este es exactamente el escenario que expone el bug: leer
    // `parseFloat(precioVentaUsd)` (el string ya mascado "33.33") en vez del
    // ref (33.33333333) le hace perder precision al Precio Final.
    fireEvent.blur(precioVentaUsd)
    expect(precioVentaUsd.value).toBe('33.33')

    const filaDetal = precioVentaUsd.closest('tr')!
    const inputsDetal = filaDetal.querySelectorAll('input')
    const precioFinalUsdInput = inputsDetal[3] as HTMLInputElement
    const precioFinalBsInput = inputsDetal[4] as HTMLInputElement

    // FIX DEL STRAY-FLOAT: sin que el usuario toque Precio Final, el sync
    // effect ya deriva su valor mascado del REF de precision completa
    // (33.33333333 * 1.16 = 38.6666666628 -> "38.67"), no del string
    // truncado (que hubiera dado el valor INCORRECTO "38.66": 33.33 * 1.16 =
    // 38.6628 -> "38.66"). Esta asercion por si sola ya prueba el fix.
    expect(precioFinalUsdInput.value).toBe('38.67')

    // FOCUS: revela la precision completa real (38.66666666), no la mascara
    // de 2 decimales ni la version truncada-via-parseFloat.
    fireEvent.focus(precioFinalUsdInput)
    expect(precioFinalUsdInput.value).toBe('38.66666666')

    // BLUR: vuelve a mascarar a 2 decimales.
    fireEvent.blur(precioFinalUsdInput)
    expect(precioFinalUsdInput.value).toBe('38.67')

    // Bs: mismo ciclo mascara/revela, derivado de pfUsd (precision completa) * tasa.
    expect(precioFinalBsInput.value).toBe('1546.67')
    fireEvent.focus(precioFinalBsInput)
    expect(precioFinalBsInput.value).toBe('1546.66666651')
    fireEvent.blur(precioFinalBsInput)
    expect(precioFinalBsInput.value).toBe('1546.67')
  })

  it('triangulacion (Mayor, valores distintos): mascara/revela Precio Final Mayor $/Bs con la formula real, no hardcodeada a Detal', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarGravableConTasa(user)

    const precioMayorUsd = container.querySelector('#prod-mayor') as HTMLInputElement
    fireEvent.change(precioMayorUsd, { target: { value: '20.00000005' } })
    fireEvent.blur(precioMayorUsd)
    expect(precioMayorUsd.value).toBe('20.00')

    const filaMayor = precioMayorUsd.closest('tr')!
    const inputsMayor = filaMayor.querySelectorAll('input')
    const precioFinalMayorUsdInput = inputsMayor[3] as HTMLInputElement
    const precioFinalMayorBsInput = inputsMayor[4] as HTMLInputElement

    // 20.00000005 * 1.16 = 23.200000058 -> masked "23.20", full "23.20000006".
    expect(precioFinalMayorUsdInput.value).toBe('23.20')
    fireEvent.focus(precioFinalMayorUsdInput)
    expect(precioFinalMayorUsdInput.value).toBe('23.20000006')
    fireEvent.blur(precioFinalMayorUsdInput)
    expect(precioFinalMayorUsdInput.value).toBe('23.20')

    // Bs: 23.200000058 * 40 = 928.00000232 (masked "928.00", full "928.00000232").
    expect(precioFinalMayorBsInput.value).toBe('928.00')
    fireEvent.focus(precioFinalMayorBsInput)
    expect(precioFinalMayorBsInput.value).toBe('928.00000232')
    fireEvent.blur(precioFinalMayorBsInput)
    expect(precioFinalMayorBsInput.value).toBe('928.00')
  })

  it('aislamiento cruzado: enfocar Precio Final Detal $ no desenmascara Precio Venta $, y viceversa', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarGravableConTasa(user)

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '33.33333333' } })
    fireEvent.blur(precioVentaUsd)
    expect(precioVentaUsd.value).toBe('33.33')

    const filaDetal = precioVentaUsd.closest('tr')!
    const precioFinalUsdInput = filaDetal.querySelectorAll('input')[3] as HTMLInputElement
    expect(precioFinalUsdInput.value).toBe('38.67')

    // Enfocar Precio Final Detal $ NO debe revelar Precio Venta $.
    fireEvent.focus(precioFinalUsdInput)
    expect(precioFinalUsdInput.value).toBe('38.66666666')
    expect(precioVentaUsd.value).toBe('33.33')
    fireEvent.blur(precioFinalUsdInput)

    // Enfocar Precio Venta $ NO debe revelar Precio Final Detal $.
    fireEvent.focus(precioVentaUsd)
    expect(precioVentaUsd.value).toBe('33.33333333')
    expect(precioFinalUsdInput.value).toBe('38.67')
    fireEvent.blur(precioVentaUsd)
  })
})
