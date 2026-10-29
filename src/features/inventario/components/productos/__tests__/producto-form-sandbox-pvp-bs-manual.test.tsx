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

// Mismo patron que producto-form-margen-precision.test.tsx: cortamos la
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

// tasaValor = 50 — numero redondo elegido para que las cascadas $<->Bs dejen
// resultados exactos (sin decimales de redondeo) y las aserciones queden
// legibles.
function setupMocks(tasaValor = 50) {
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

/**
 * Activa el sandbox "Usa tasa paralela" y completa factura/tasa paralela
 * para que el costo contable del preview quede en un valor fijo y legible.
 * Con `costoFactura=10` y `tasaParalela=50` sobre `tasaValor=50`
 * (`costoContable = costoFactura * tasaParalela / tasaInterna`) el costo
 * contable queda en exactamente $10.
 */
async function activarSandboxTasaParalela(container: HTMLElement) {
  const checkbox = container.querySelector('#prod-tasa-paralela-check') as HTMLInputElement
  fireEvent.click(checkbox)

  const costoFactura = container.querySelector('#prod-costo-factura') as HTMLInputElement
  fireEvent.change(costoFactura, { target: { value: '10' } })
  const tasaParalela = container.querySelector('#prod-tasa-paralela') as HTMLInputElement
  fireEvent.change(tasaParalela, { target: { value: '50' } })
}

function sandboxTable(container: HTMLElement): HTMLTableElement {
  // La tabla del sandbox "Editar manual todo" es la PRIMERA <table> del DOM
  // (precede en el JSX a la tabla del Esquema de Precios v2, que es
  // siempre-presente pero no relevante aqui) — orden estatico, no depende
  // de renders condicionales.
  return container.querySelectorAll('table')[0] as HTMLTableElement
}

describe('ProductoForm — sandbox Tasa Paralela, modo "Editar manual todo" (cascada bidireccional Margen/PVP $/PVP Bs)', () => {
  it('pre-llena Margen/PVP $/PVP Bs coherentes al entrar en modo manual (margen previo 0%)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarSandboxTasaParalela(container)

    await user.click(screen.getByRole('button', { name: 'Editar manual todo' }))

    const table = sandboxTable(container)
    const inputs = table.querySelectorAll('input')
    const [margenInput, pvpUsdInput, pvpBsInput] = Array.from(inputs) as HTMLInputElement[]

    expect(margenInput.value).toBe('0')
    expect(pvpUsdInput.value).toBe('10.00')
    expect(pvpBsInput.value).toBe('500.00')
  })

  it('editar Margen % recalcula PVP $ y PVP Bs (costo $10, margen 50% -> PVP $15.00 / Bs 750.00)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarSandboxTasaParalela(container)
    await user.click(screen.getByRole('button', { name: 'Editar manual todo' }))

    const table = sandboxTable(container)
    const [margenInput, pvpUsdInput, pvpBsInput] = Array.from(table.querySelectorAll('input')) as HTMLInputElement[]

    fireEvent.change(margenInput, { target: { value: '50' } })

    expect(pvpUsdInput.value).toBe('15.00')
    expect(pvpBsInput.value).toBe('750.00')
  })

  it('editar Precio Venta $ recalcula Margen % y PVP Bs (costo $10, PVP $20 -> margen 100.00% / Bs 1000.00)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarSandboxTasaParalela(container)
    await user.click(screen.getByRole('button', { name: 'Editar manual todo' }))

    const table = sandboxTable(container)
    const [margenInput, pvpUsdInput, pvpBsInput] = Array.from(table.querySelectorAll('input')) as HTMLInputElement[]

    fireEvent.change(pvpUsdInput, { target: { value: '20' } })

    expect(margenInput.value).toBe('100.00')
    expect(pvpBsInput.value).toBe('1000.00')
  })

  it('editar Precio Venta Bs recalcula Margen % y PVP $ (costo $10, PVP Bs 600 -> PVP $12.00 / margen 20.00%)', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarSandboxTasaParalela(container)
    await user.click(screen.getByRole('button', { name: 'Editar manual todo' }))

    const table = sandboxTable(container)
    const [margenInput, pvpUsdInput, pvpBsInput] = Array.from(table.querySelectorAll('input')) as HTMLInputElement[]

    fireEvent.change(pvpBsInput, { target: { value: '600' } })

    expect(margenInput.value).toBe('20.00')
    expect(pvpUsdInput.value).toBe('12.00')
  })

  it('margen negativo (PVP $ por debajo del costo) muestra el aviso y bloquea "Confirmar cambios" en modo manual', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)
    await activarSandboxTasaParalela(container)
    await user.click(screen.getByRole('button', { name: 'Editar manual todo' }))

    const table = sandboxTable(container)
    const [, pvpUsdInput] = Array.from(table.querySelectorAll('input')) as HTMLInputElement[]

    // costo contable = $10, PVP $5 -> margen = (5-10)/10*100 = -50%.
    fireEvent.change(pvpUsdInput, { target: { value: '5' } })

    expect(screen.getByText('Margen negativo en este nivel.')).toBeInTheDocument()
    expect(screen.getByText('No se puede confirmar: hay niveles con margen negativo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar cambios' })).toBeDisabled()
  })
})

describe('ProductoForm — bloqueo de margen negativo del sandbox en los 3 modos de recalculo', () => {
  it('un margen real previo negativo (PVP < costo) bloquea "Confirmar cambios" en margen/mantener_pvp/manual', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProductoForm isOpen onClose={() => {}} />)
    await abrirTabPrecios(user)

    // Deja el form REAL con margen Detal negativo: costo $10, PVP $5 ->
    // margen = -50%. `handlePrecioVentaUsdChange` no clampea el margen
    // calculado (regla de negocio: avisar, no corregir en silencio).
    const costoInput = screen.getByLabelText(/costo \(usd\)/i)
    fireEvent.change(costoInput, { target: { value: '10' } })
    const precioVentaUsd = container.querySelector('#prod-venta') as HTMLInputElement
    fireEvent.change(precioVentaUsd, { target: { value: '5' } })

    await activarSandboxTasaParalela(container)

    // Modo 'margen' (default al activar el checkbox): preserva el margen
    // real previo (-50%) contra el costo contable del sandbox ($10).
    expect(screen.getByRole('button', { name: 'Confirmar cambios' })).toBeDisabled()
    expect(screen.getByText('No se puede confirmar: hay niveles con margen negativo.')).toBeInTheDocument()

    // Modo 'mantener_pvp': preserva el PVP real previo ($5) -> margen
    // implicito = (5-10)/10*100 = -50%. Sigue bloqueado.
    await user.click(screen.getByRole('button', { name: 'Mantener PVP' }))
    expect(screen.getByRole('button', { name: 'Confirmar cambios' })).toBeDisabled()

    // Modo 'manual': el pre-fill arranca desde el margen real previo
    // (-50%), que `hayMargenNegativoEnNiveles` tambien detecta.
    await user.click(screen.getByRole('button', { name: 'Editar manual todo' }))
    expect(screen.getByRole('button', { name: 'Confirmar cambios' })).toBeDisabled()
  })
})
