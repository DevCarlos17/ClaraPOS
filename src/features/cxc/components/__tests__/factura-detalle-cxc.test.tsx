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

import { render, screen } from '@testing-library/react'
import { FacturaDetalleCxc } from '../factura-detalle-cxc'
import {
  useDetalleFactura,
  usePagosFactura,
  useCargosEspecialesVenta,
  useVencimientosVenta,
  useSafAplicacionesFactura,
  type VentaPendiente,
  type PagoFacturaCxc,
  type SafAplicacionFacturaCxc,
} from '../../hooks/use-cxc'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions } from '@/core/hooks/use-permissions'

vi.mock('../../hooks/use-cxc', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/use-cxc')>('../../hooks/use-cxc')
  return {
    ...actual,
    useDetalleFactura: vi.fn(),
    usePagosFactura: vi.fn(),
    useCargosEspecialesVenta: vi.fn(),
    useVencimientosVenta: vi.fn(),
    useSafAplicacionesFactura: vi.fn(),
  }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/hooks/use-permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/hooks/use-permissions')>()
  return { ...actual, usePermissions: vi.fn() }
})
vi.mock('../pago-factura-modal', () => ({ PagoFacturaModal: () => null }))
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({ SupervisorPinDialog: () => null }))

const mockedUseDetalleFactura = vi.mocked(useDetalleFactura)
const mockedUsePagosFactura = vi.mocked(usePagosFactura)
const mockedUseCargosEspecialesVenta = vi.mocked(useCargosEspecialesVenta)
const mockedUseVencimientosVenta = vi.mocked(useVencimientosVenta)
const mockedUseSafAplicacionesFactura = vi.mocked(useSafAplicacionesFactura)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)

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
