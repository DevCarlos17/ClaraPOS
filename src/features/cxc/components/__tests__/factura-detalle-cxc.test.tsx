// Mockeamos `@/core/db/powersync/db` y los modulos de contabilidad porque
// `use-cxc.ts` (y por extension `use-permissions.ts` -> `connector.ts`) hacen
// trabajo real a nivel de modulo que revienta en el entorno de test sin estos
// mocks. Mismo patron que `use-cxc.test.ts`.
vi.mock('@/core/db/powersync/db', () => ({
  db: { writeTransaction: vi.fn() },
}))
vi.mock('@/features/contabilidad/hooks/use-cuentas-config', () => ({
  cargarMapaCuentas: vi.fn(async () => ({})),
}))
vi.mock('@/features/contabilidad/lib/generar-asientos', () => ({
  generarAsientosPagoCxC: vi.fn(async () => undefined),
  reversarAsientos: vi.fn(async () => undefined),
  leerMonedaContable: vi.fn(async () => 'USD'),
}))

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FacturaDetalleCxc } from '../factura-detalle-cxc'
import {
  useDetalleFactura,
  usePagosFactura,
  useCargosEspecialesVenta,
  useVencimientosVenta,
  useSafAplicacionesFactura,
  registrarReversoAbono,
  type VentaPendiente,
  type PagoFacturaCxc,
  type SafAplicacionFacturaCxc,
} from '../../hooks/use-cxc'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions } from '@/core/hooks/use-permissions'
import { clasificarAbonoParaReverso } from '@/features/ventas/hooks/use-clasificar-abono-reverso'
import { reversarAbonoDirectoDesdeTesoreria } from '@/features/tesoreria/hooks/use-reverso-abono-directo'

vi.mock('../../hooks/use-cxc', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/use-cxc')>('../../hooks/use-cxc')
  return {
    ...actual,
    useDetalleFactura: vi.fn(),
    usePagosFactura: vi.fn(),
    useCargosEspecialesVenta: vi.fn(),
    useVencimientosVenta: vi.fn(),
    useSafAplicacionesFactura: vi.fn(),
    registrarReversoAbono: vi.fn(),
  }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/hooks/use-permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/hooks/use-permissions')>()
  return { ...actual, usePermissions: vi.fn() }
})
vi.mock('../pago-factura-modal', () => ({ PagoFacturaModal: () => null }))
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({ SupervisorPinDialog: () => null }))
// Unit 3 (tesoreria-reverso-abono-directo, bug-fix FacturaDetalleCxc): la
// clasificacion (Unit 1) y el orquestador bancario (slice 2b-i-a) se
// mockean enteros — ninguno de los dos debe ejecutar SQL real en este test.
vi.mock('@/features/ventas/hooks/use-clasificar-abono-reverso', () => ({
  clasificarAbonoParaReverso: vi.fn(),
}))
vi.mock('@/features/tesoreria/hooks/use-reverso-abono-directo', () => ({
  reversarAbonoDirectoDesdeTesoreria: vi.fn(),
}))

const mockedUseDetalleFactura = vi.mocked(useDetalleFactura)
const mockedUsePagosFactura = vi.mocked(usePagosFactura)
const mockedUseCargosEspecialesVenta = vi.mocked(useCargosEspecialesVenta)
const mockedUseVencimientosVenta = vi.mocked(useVencimientosVenta)
const mockedUseSafAplicacionesFactura = vi.mocked(useSafAplicacionesFactura)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedRegistrarReversoAbono = vi.mocked(registrarReversoAbono)
const mockedClasificarAbonoParaReverso = vi.mocked(clasificarAbonoParaReverso)
const mockedReversarAbonoDirectoDesdeTesoreria = vi.mocked(reversarAbonoDirectoDesdeTesoreria)

function baseFactura(overrides: Partial<VentaPendiente> = {}): VentaPendiente {
  return {
    id: 'venta-1',
    nro_factura: 'C01-000001',
    fecha: '2026-08-13T10:30:00.000-04:00',
    total_usd: '30.00',
    total_bs: '1200.00',
    saldo_pend_usd: '0.00',
    tasa: '40.0000',
    tipo: 'CREDITO',
    cliente_id: 'cli-1',
    ...overrides,
  }
}

function basePago(overrides: Partial<PagoFacturaCxc> = {}): PagoFacturaCxc {
  return {
    id: 'pago-1',
    venta_id: 'venta-1',
    metodo_cobro_id: 'met-1',
    moneda_id: 'mon-1',
    tasa: '40.0000',
    monto: '30.00',
    monto_usd: '30.00',
    referencia: null,
    fecha: '2026-08-13T10:30:00.000-04:00',
    metodo_nombre: 'Efectivo USD',
    moneda_label: 'USD',
    is_reversed: 0,
    reversed_at: null,
    reversed_by: null,
    reversed_reason: null,
    procesado_por_nombre: 'Cajero',
    created_by: 'user-1',
    ...overrides,
  }
}

function baseSafAplicacion(overrides: Partial<SafAplicacionFacturaCxc> = {}): SafAplicacionFacturaCxc {
  return {
    id: 'sca-1',
    referencia: 'SAF-0001',
    monto: '30.00000000',
    tasa_pago: '40.0000',
    fecha: '2026-08-20',
    saf_origen_refs: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
  mockedUseCargosEspecialesVenta.mockReturnValue({ cargos: [], isLoading: false })
  mockedUseVencimientosVenta.mockReturnValue({ vencimientos: [], isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'cajero@email.com', nombre: 'Cajero', level: 3, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUsePermissions.mockReturnValue({ hasPermission: () => false } as unknown as ReturnType<typeof usePermissions>)
  mockedRegistrarReversoAbono.mockResolvedValue(undefined)
  mockedReversarAbonoDirectoDesdeTesoreria.mockResolvedValue(undefined)
})

describe('FacturaDetalleCxc — gate "Sin pagos registrados" (Fix B, saf-snapshot-y-trazabilidad PR8)', () => {
  it('BUG antes del fix: factura pagada 100% via SAF (cero pagos en efectivo) — la tabla se monta y muestra la fila "Saldo a favor", NUNCA "Sin pagos registrados"', () => {
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseSafAplicacionesFactura.mockReturnValue({
      safAplicaciones: [baseSafAplicacion({ monto: '30.00000000', referencia: 'SAF-0001' })],
      isLoading: false,
    })

    render(<FacturaDetalleCxc isOpen factura={baseFactura()} onClose={vi.fn()} />)

    expect(screen.getByText('Saldo a favor')).toBeInTheDocument()
    expect(screen.getByText('SAF-0001')).toBeInTheDocument()
  })

  it('sin pagos en efectivo Y sin aplicaciones SAF, muestra "Sin pagos registrados" (comportamiento preservado)', () => {
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseSafAplicacionesFactura.mockReturnValue({ safAplicaciones: [], isLoading: false })

    render(<FacturaDetalleCxc isOpen factura={baseFactura()} onClose={vi.fn()} />)

    expect(screen.getByText('Sin pagos registrados')).toBeInTheDocument()
  })

  it('con pagos en efectivo (sin SAF), la tabla se monta (comportamiento preservado — regresion)', () => {
    mockedUsePagosFactura.mockReturnValue({ pagos: [basePago()], isLoading: false })
    mockedUseSafAplicacionesFactura.mockReturnValue({ safAplicaciones: [], isLoading: false })

    render(<FacturaDetalleCxc isOpen factura={baseFactura()} onClose={vi.fn()} />)

    expect(screen.queryByText('Sin pagos registrados')).toBeNull()
    expect(screen.getByText('Efectivo USD')).toBeInTheDocument()
  })

  it('con pagos en efectivo Y aplicaciones SAF (pago mixto), ambas filas aparecen sin double-counting', () => {
    mockedUsePagosFactura.mockReturnValue({ pagos: [basePago({ monto_usd: '10.00' })], isLoading: false })
    mockedUseSafAplicacionesFactura.mockReturnValue({
      safAplicaciones: [baseSafAplicacion({ monto: '20.00000000' })],
      isLoading: false,
    })

    render(<FacturaDetalleCxc isOpen factura={baseFactura()} onClose={vi.fn()} />)

    expect(screen.getByText('Efectivo USD')).toBeInTheDocument()
    expect(screen.getByText('Saldo a favor')).toBeInTheDocument()
  })

  it('mientras pagos esta cargando, muestra el skeleton y NUNCA "Sin pagos registrados" aunque no haya SAF todavia', () => {
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: true })
    mockedUseSafAplicacionesFactura.mockReturnValue({ safAplicaciones: [], isLoading: false })

    render(<FacturaDetalleCxc isOpen factura={baseFactura()} onClose={vi.fn()} />)

    expect(screen.queryByText('Sin pagos registrados')).toBeNull()
  })
})

describe('FacturaDetalleCxc — split emision vs post-emision (PR9, saf-seccion-correcta)', () => {
  it('SAF a la EMISION se agrupa junto a "pagos" (antes); SAF post-emision se agrupa junto a "Evolucion" (despues) — sin importar el orden del array fuente', () => {
    const factura = baseFactura()
    mockedUsePagosFactura.mockReturnValue({ pagos: [basePago()], isLoading: false })
    mockedUseSafAplicacionesFactura.mockReturnValue({
      // Post-emision LISTADO PRIMERO en el array fuente, emision SEGUNDO —
      // si el componente simplemente hiciera `.map()` sin partir el arreglo,
      // el orden en el DOM seria [SAF-POST, SAF-EMI] (preserva el orden del
      // array). El split correcto debe producir [SAF-EMI, SAF-POST].
      safAplicaciones: [
        baseSafAplicacion({ id: 'sca-post', referencia: 'SAF-POST', fecha: '2026-09-01' }),
        baseSafAplicacion({ id: 'sca-emi', referencia: 'SAF-EMI', fecha: factura.fecha }),
      ],
      isLoading: false,
    })

    render(<FacturaDetalleCxc isOpen factura={factura} onClose={vi.fn()} />)

    const referencias = screen.getAllByText(/^SAF-(POST|EMI)$/).map((el) => el.textContent)
    expect(referencias).toEqual(['SAF-EMI', 'SAF-POST'])
  })

  it('con SOLO SAF a la emision, la fila aparece (misma fila visual "Saldo a favor" que antes — paridad con PR8)', () => {
    const factura = baseFactura()
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseSafAplicacionesFactura.mockReturnValue({
      safAplicaciones: [baseSafAplicacion({ referencia: 'SAF-EMI-UNICO', fecha: factura.fecha })],
      isLoading: false,
    })

    render(<FacturaDetalleCxc isOpen factura={factura} onClose={vi.fn()} />)

    expect(screen.getByText('Saldo a favor')).toBeInTheDocument()
    expect(screen.getByText('SAF-EMI-UNICO')).toBeInTheDocument()
  })
})

/**
 * Bug fix cubierto por `tesoreria-reverso-abono-directo` (delta MODIFIED,
 * Requirement `FacturaDetalleCxc enruta por tipo de pago`). Antes de este
 * fix, el boton "Reversar" de esta pantalla llamaba SIEMPRE
 * `registrarReversoAbono` (CxC-only, sin leg bancario) sin importar si el
 * pago era DIRECTO — dejando `bancos_empresa.saldo_actual` inflado para
 * siempre en pagos directos (sin egreso contraparte). Estos tests clavan
 * el enrutamiento correcto: DIRECT -> `reversarAbonoDirectoDesdeTesoreria`
 * (bank-aware), no-DIRECT (BATCH/SAF/LEGACY) -> `registrarReversoAbono`
 * SIN CAMBIOS (regresion guard del comportamiento ya shippeado).
 */
describe('FacturaDetalleCxc — enrutamiento del boton "Reversar" (tesoreria-reverso-abono-directo, Unit 3)', () => {
  beforeEach(() => {
    // CXC_REVERSE concedido: el click en "Reversar" abre directo el dialogo
    // de motivo (sin pasar por el PIN de supervisor), igual que el test de
    // permiso de abajo necesita la rama inversa.
    mockedUsePermissions.mockReturnValue({ hasPermission: () => true } as unknown as ReturnType<typeof usePermissions>)
    mockedUsePagosFactura.mockReturnValue({ pagos: [basePago()], isLoading: false })
    mockedUseSafAplicacionesFactura.mockReturnValue({ safAplicaciones: [], isLoading: false })
  })

  async function clickReversarYConfirmar(motivo = 'Pago duplicado') {
    fireEvent.click(screen.getByRole('button', { name: 'Reversar' }))
    const textarea = screen.getByPlaceholderText(/Ej: Error en el monto registrado/i)
    fireEvent.change(textarea, { target: { value: motivo } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reverso' }))
  }

  it('abono DIRECTO: enruta a reversarAbonoDirectoDesdeTesoreria con el ingresoId resuelto por el clasificador, y NUNCA llama a registrarReversoAbono', async () => {
    mockedClasificarAbonoParaReverso.mockResolvedValue({
      pagoId: 'pago-1',
      estado: 'DIRECT',
      ingresoId: 'ingreso-1',
      sesionCerrada: false,
    })

    render(<FacturaDetalleCxc isOpen factura={baseFactura()} onClose={vi.fn()} />)
    await clickReversarYConfirmar('Pago duplicado')

    await waitFor(() => expect(mockedReversarAbonoDirectoDesdeTesoreria).toHaveBeenCalledTimes(1))
    expect(mockedReversarAbonoDirectoDesdeTesoreria).toHaveBeenCalledWith({
      ingresoId: 'ingreso-1',
      motivo: 'Pago duplicado',
      userId: 'user-1',
      reversedByNombre: 'Cajero',
      empresaId: 'emp-1',
    })
    expect(mockedRegistrarReversoAbono).not.toHaveBeenCalled()
  })

  it.each([
    { estado: 'BATCH' as const, ingresoId: undefined },
    { estado: 'SAF' as const, ingresoId: 'ingreso-saf-1' },
    { estado: 'LEGACY' as const, ingresoId: undefined },
  ])('abono $estado: preserva el comportamiento previo via registrarReversoAbono, y NUNCA llama a reversarAbonoDirectoDesdeTesoreria', async ({ estado, ingresoId }: { estado: 'BATCH' | 'SAF' | 'LEGACY'; ingresoId: string | undefined }) => {
    mockedClasificarAbonoParaReverso.mockResolvedValue({
      pagoId: 'pago-1',
      estado,
      ingresoId,
      sesionCerrada: false,
      reasonCode: estado === 'DIRECT' ? undefined : `${estado}_CODE`,
    })

    render(<FacturaDetalleCxc isOpen factura={baseFactura()} onClose={vi.fn()} />)
    await clickReversarYConfirmar('Pago duplicado')

    await waitFor(() => expect(mockedRegistrarReversoAbono).toHaveBeenCalledTimes(1))
    expect(mockedRegistrarReversoAbono).toHaveBeenCalledWith({
      pago_id: 'pago-1',
      reason: 'Pago duplicado',
      reversed_by: 'user-1',
      reversed_by_nombre: 'Cajero',
      empresa_id: 'emp-1',
    })
    expect(mockedReversarAbonoDirectoDesdeTesoreria).not.toHaveBeenCalled()
  })

  it('nunca invoca ambos orquestadores a la vez (no double-reverse) para un abono DIRECTO', async () => {
    mockedClasificarAbonoParaReverso.mockResolvedValue({
      pagoId: 'pago-1',
      estado: 'DIRECT',
      ingresoId: 'ingreso-1',
      sesionCerrada: false,
    })

    render(<FacturaDetalleCxc isOpen factura={baseFactura()} onClose={vi.fn()} />)
    await clickReversarYConfirmar()

    await waitFor(() => expect(mockedReversarAbonoDirectoDesdeTesoreria).toHaveBeenCalledTimes(1))
    expect(mockedRegistrarReversoAbono).toHaveBeenCalledTimes(0)
  })

  it('gate de permiso CXC_REVERSE se mantiene intacto: sin el permiso, "Reversar" exige PIN de supervisor en vez de clasificar/reversar de una', () => {
    mockedUsePermissions.mockReturnValue({ hasPermission: () => false } as unknown as ReturnType<typeof usePermissions>)

    render(<FacturaDetalleCxc isOpen factura={baseFactura()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reversar' }))

    // El dialogo de motivo (textarea) NUNCA se abre sin pasar primero por el
    // PIN de supervisor (mockeado a `null`, no clickeable en este test) —
    // y por lo tanto el clasificador tampoco se invoca todavia.
    expect(screen.queryByPlaceholderText(/Ej: Error en el monto registrado/i)).toBeNull()
    expect(mockedClasificarAbonoParaReverso).not.toHaveBeenCalled()
  })
})
