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

// Correccion (Slice 5.1) sobre producto-form-mascara-decimales: cubre los 3
// hallazgos del verify-report (engram sdd/producto-form-mascara-decimales/verify-report):
// CRITICO 1 (bypass de *FullRef en ~34 sitios de lectura interna), CRITICO 2
// (costoUsdFullRef queda stale tras setCostoUsd() bare en handleTipoChange/
// handleLimpiar) y WARNING 3 (un cero explicito desaparece al perder el foco).
//
// Mismo patron que los archivos hermanos (`-margen-precision`,
// `-costo-precision`, `-precio-precision-submit`): cortamos la
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
// CRITICAL 1 — bypass de *FullRef en lecturas internas de back-calc.
// Un campo se enfoca+tipea+pierde el foco (mascara a 2 decimales) y LUEGO
// otro campo dispara un recalculo que debe leer el ref de precision
// completa del primero, no su display ya mascarado.
// ============================================================
describe('CRITICAL 1 — lecturas internas de back-calc deben usar el ref de precision completa, no el display mascarado', () => {
  it('Margen enfocado+blur, luego Costo editado -> PVP calcula con margenFullRef (33.333333), no con el 33.33 mascarado', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]! as HTMLInputElement
    fireEvent.change(margenDetal, { target: { value: '33.333333' } })
    fireEvent.blur(margenDetal)
    expect(margenDetal.value).toBe('33.33')

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    // pvp = 10 * (1 + 33.333333/100) = 13.3333333 -> mostrado a 2 decimales
    // (13.333 con el bug tambien redondea a "13.33" mostrado, la diferencia
    // solo es visible en la precision completa que se envia).
    expect(precioVentaUsd.value).toBe('13.33')

    await completarIdentidadYDeposito(user, container)
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    // Con el bug, applyPricesFromCosto lee parseFloat(margen)=33.33 -> pvp=13.333.
    // Corregido, lee margenFullRef.current=33.333333 -> pvp=13.3333333.
    expect(enviado.precio_venta_usd).toBeCloseTo(13.3333333, 4)
  })

  it('simetrico: Costo enfocado+blur, luego Margen editado -> PVP calcula con costoUsdFullRef (7.123456), no con el 7.12 mascarado', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.change(costoInput, { target: { value: '7.123456' } })
    fireEvent.blur(costoInput)
    expect(costoInput.value).toBe('7.12')

    const margenDetal = screen.getAllByPlaceholderText('0')[0]!
    fireEvent.change(margenDetal, { target: { value: '20' } })

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    // pvp = 7.123456 * 1.2 = 8.5481472 -> "8.55" mostrado.
    // Con el bug (parseFloat(costoUsd)=7.12): 7.12*1.2=8.544 -> "8.54".
    // Esta asercion por si sola distingue el bug en el DISPLAY, no solo en el submit.
    expect(precioVentaUsd.value).toBe('8.55')

    await completarIdentidadYDeposito(user, container)
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    expect(enviado.precio_venta_usd).toBeCloseTo(8.5481472, 4)
  })

  it('simetrico: Precio Venta $ enfocado+blur, luego Costo editado -> Margen recalculado con precioVentaUsdFullRef (10.123456), no con el 10.12 mascarado', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '10.123456' } })
    fireEvent.blur(precioVentaUsd)
    expect(precioVentaUsd.value).toBe('10.12')

    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '5' } })

    const margenDetal = screen.getAllByPlaceholderText('0')[0]! as HTMLInputElement
    // margenCalc = (10.123456 - 5) / 5 * 100 = 102.46912 -> "102.47".
    // Con el bug (parseFloat(precioVentaUsd)=10.12): (10.12-5)/5*100=102.40 -> "102.40".
    expect(margenDetal.value).toBe('102.47')
  })
})

// ============================================================
// CRITICAL 2 — costoUsdFullRef queda stale tras setCostoUsd() bare
// (handleTipoChange('C') / handleLimpiar), en vez de pasar por setCostoCompleto.
// ============================================================
describe('CRITICAL 2 — costoUsdFullRef no debe quedar stale tras resets que bypassean setCostoCompleto', () => {
  it('cambiar tipo a Combo y volver a Producto sin retocar Costo -> el ref stale NO se envia (costo_usd debe ser 0)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.change(costoInput, { target: { value: '15.999999' } })
    // PVP fijado por encima de cualquier costo_usd posible (stale 15.999999
    // o correcto 0) para que el refine `precio_venta_usd >= costo_usd` del
    // schema NUNCA sea el motivo de un submit rechazado — lo unico que este
    // test debe medir es el valor de costo_usd enviado.
    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '50' } })

    await user.click(screen.getByRole('radio', { name: 'Combo / Receta' }))
    await user.click(screen.getByRole('radio', { name: 'Producto' }))

    await completarIdentidadYDeposito(user, container)
    // Se dispara el submit directamente sobre el <form> (no via click en el
    // boton "Crear", que puede estar disabled por costoUsd display en '0' —
    // eso es una guard de UX separada; el bug bajo prueba es que
    // `handleSubmit` en si mismo no debe leer el ref stale).
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    expect(enviado.costo_usd).toBe(0)
  })

  it('handleLimpiar debe resetear costoUsdFullRef, no solo el display de Costo', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.change(costoInput, { target: { value: '22.777777' } })

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))

    // No se toca Margen/PVP tras Limpiar a proposito: cualquier interaccion
    // con esos campos dispara el modo de exploracion de costo (activo
    // porque costoUsd/costoBs quedan vacios tras Limpiar) y recalcularia
    // costo_usd desde ese input, contaminando la medicion. Sin tocarlos,
    // precio_venta_usd se queda en 0 (reseteado correctamente por
    // handleLimpiar): si costoUsdFullRef tambien quedo en 0 (fix), el
    // refine `0 >= 0` pasa y el submit se completa; si quedo stale (bug),
    // `0 >= 22.777777` falla la validacion y crearProducto nunca se llama.
    await completarIdentidadYDeposito(user, container)
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(mockedCrearProducto).toHaveBeenCalledTimes(1))
    const enviado = mockedCrearProducto.mock.calls[0]![0]
    expect(enviado.costo_usd).toBe(0)
  })
})

// ============================================================
// WARNING 3 — un cero explicito no debe desaparecer al perder el foco;
// solo un campo verdaderamente vacio (nunca tocado) debe quedar en "".
// ============================================================
describe('WARNING 3 — un cero explicito se mascara a "0.00" en blur, distinto de un campo vacio', () => {
  it('Costo: tipear "0" y perder el foco muestra "0.00", no ""', async () => {
    const user = userEvent.setup()
    render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.change(costoInput, { target: { value: '0' } })
    fireEvent.blur(costoInput)
    expect(costoInput.value).toBe('0.00')
  })

  it('triangulacion — Margen Detal: tipear "0" y perder el foco muestra "0.00", no ""', async () => {
    const user = userEvent.setup()
    render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const margenDetal = screen.getAllByPlaceholderText('0')[0]! as HTMLInputElement
    fireEvent.change(margenDetal, { target: { value: '0' } })
    fireEvent.blur(margenDetal)
    expect(margenDetal.value).toBe('0.00')
  })

  it('triangulacion — Precio Venta $: tipear "0" y perder el foco muestra "0.00", no ""', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '0' } })
    fireEvent.blur(precioVentaUsd)
    expect(precioVentaUsd.value).toBe('0.00')
  })

  it('un campo verdaderamente vacio (nunca tocado) sigue vacio al perder el foco', async () => {
    const user = userEvent.setup()
    render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    const costoInput = screen.getByLabelText(/costo \(usd\)/i) as HTMLInputElement
    fireEvent.focus(costoInput)
    fireEvent.blur(costoInput)
    expect(costoInput.value).toBe('')
  })
})
