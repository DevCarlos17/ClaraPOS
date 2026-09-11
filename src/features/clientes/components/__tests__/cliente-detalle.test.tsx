import { render, screen, fireEvent } from '@testing-library/react'
import { ClienteDetalle } from '../cliente-detalle'
import {
  useMovimientosClienteFiltrados,
  type Cliente,
  type MovimientoCuenta,
} from '@/features/clientes/hooks/use-clientes'
import { usePagosCliente } from '@/features/cxc/hooks/use-cxc'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions } from '@/core/hooks/use-permissions'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useFacturasEmpresa } from '@/features/ventas/hooks/use-facturas-empresa'
import { useQuery } from '@powersync/react'
import * as currency from '@/lib/currency'

// `ClienteDetalle` es el componente bajo prueba (Design §Root Cause): header
// y tabla deben derivar del MISMO array `movimientos`; ademas renderiza la
// seccion Facturas (PR3) via useFacturasEmpresa. Se mockean todas las
// dependencias de datos directamente, mismo patron que `kardex-list.test.tsx`.
vi.mock('@powersync/react', () => ({ useQuery: vi.fn(), usePowerSync: vi.fn(() => ({})) }))
vi.mock('@/features/clientes/hooks/use-clientes', () => ({
  useMovimientosClienteFiltrados: vi.fn(),
}))
vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  usePagosCliente: vi.fn(),
  registrarReversoAbono: vi.fn(),
}))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
  PERMISSIONS: { CXC_REVERSE: 'cxc.reversar_abono' },
}))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({
  SupervisorPinDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="mock-pin-dialog" /> : null,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/ventas/hooks/use-facturas-empresa', () => ({ useFacturasEmpresa: vi.fn() }))
vi.mock('@/features/ventas/components/facturas-empresa-tab', () => ({
  FacturasEmpresaTable: ({ mostrarAcciones }: { mostrarAcciones?: boolean }) => (
    <div data-testid="facturas-table" data-mostrar-acciones={String(mostrarAcciones)} />
  ),
}))

const mockedUseMovimientosClienteFiltrados = vi.mocked(useMovimientosClienteFiltrados)
const mockedUsePagosCliente = vi.mocked(usePagosCliente)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedUseTasaActual = vi.mocked(useTasaActual)
const mockedUseFacturasEmpresa = vi.mocked(useFacturasEmpresa)
const mockedUseQuery = vi.mocked(useQuery)

function cliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 'cli-1',
    identificacion: 'V-12345678',
    nombre: 'Maria Perez',
    direccion: null,
    telefono: null,
    limite_credito_usd: '500.00',
    saldo_actual: '150.00000000',
    is_active: 1,
    created_at: '2026-01-01T00:00:00-04:00',
    updated_at: '2026-01-01T00:00:00-04:00',
    ...overrides,
  }
}

function movimiento(overrides: Partial<MovimientoCuenta> = {}): MovimientoCuenta {
  return {
    id: 'mov-1',
    cliente_id: 'cli-1',
    tipo: 'FAC',
    referencia: 'FAC-000001',
    monto: '50.00000000',
    saldo_anterior: '100.00000000',
    saldo_nuevo: '150.00000000',
    observacion: null,
    venta_id: null,
    fecha: '2026-05-10T10:00:00-04:00',
    created_at: '2026-05-10T10:00:00-04:00',
    created_by: null,
    moneda_pago: null,
    monto_moneda: null,
    tasa_pago: null,
    ...overrides,
  }
}

const CLIENTE: Cliente = {
  id: 'cli-1',
  identificacion: 'V-12345678',
  nombre: 'MARIA PEREZ',
  direccion: null,
  telefono: null,
  limite_credito_usd: '500.00',
  saldo_actual: '120.50',
  is_active: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(new Date('2026-05-21T12:00:00-04:00'))

  mockedUseMovimientosClienteFiltrados.mockReturnValue({ movimientos: [], isLoading: false } as never)
  mockedUsePagosCliente.mockReturnValue({ pagos: [], isLoading: false } as never)
  mockedUseCurrentUser.mockReturnValue({
    user: {
      id: 'user-1',
      email: 'a@a.com',
      nombre: 'Cajero',
      level: 3,
      rol_id: null,
      rol_nombre: null,
      empresa_id: 'emp-1',
    },
    loading: false,
  })
  mockedUsePermissions.mockReturnValue({
    hasPermission: () => false,
    hasAnyPermission: () => false,
    hasAllPermissions: () => false,
    isOwner: false,
    rolId: '',
    rolNombre: '',
    loading: false,
  } as never)
  mockedUseTasaActual.mockReturnValue({
    tasa: undefined,
    tasaValor: 40,
    isLoading: false,
    isFromCache: false,
  } as never)
  mockedUseQuery.mockReturnValue({ data: [{ saldo_actual: '150.00000000' }], isLoading: false } as never)
  mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: false })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ClienteDetalle — paridad header/body (Design §Root Cause: una sola fuente de verdad)', () => {
  it('con 0 movimientos: header y body concuerdan en 0 (Spec: "Header count matches rendered rows") y aparece "Sin movimientos"', () => {
    mockedUseMovimientosClienteFiltrados.mockReturnValue({ movimientos: [], isLoading: false } as never)

    render(<ClienteDetalle onVolver={vi.fn()} cliente={cliente()} />)

    expect(screen.getByText('Sin movimientos')).toBeInTheDocument()
    expect(screen.getByText('0 movimiento(s) en el periodo')).toBeInTheDocument()
  })

  it('con 1 movimiento: el header dice "1 movimiento(s)" y se renderiza exactamente 1 fila, sin "Sin movimientos"', () => {
    mockedUseMovimientosClienteFiltrados.mockReturnValue({
      movimientos: [movimiento({ id: 'mov-1', referencia: 'FAC-000001' })],
      isLoading: false,
    } as never)

    render(<ClienteDetalle onVolver={vi.fn()} cliente={cliente()} />)

    expect(screen.getByText('1 movimiento(s) en el periodo')).toBeInTheDocument()
    expect(screen.getByText('FAC-000001')).toBeInTheDocument()
    expect(screen.queryByText('Sin movimientos')).not.toBeInTheDocument()
  })

  it('con 5 movimientos: el header dice "5 movimiento(s)" y las 5 referencias estan presentes (triangulacion N>1)', () => {
    const movimientos = Array.from({ length: 5 }, (_, i) =>
      movimiento({ id: `mov-${i}`, referencia: `FAC-00000${i}` })
    )
    mockedUseMovimientosClienteFiltrados.mockReturnValue({ movimientos, isLoading: false } as never)

    render(<ClienteDetalle onVolver={vi.fn()} cliente={cliente()} />)

    expect(screen.getByText('5 movimiento(s) en el periodo')).toBeInTheDocument()
    movimientos.forEach((m) => {
      expect(screen.getByText(m.referencia)).toBeInTheDocument()
    })
  })

  it('al montar, pasa el rango del mes actual {fechaDesde: startOfMonth(), fechaHasta: todayStr()} al hook (Spec: "Default and custom date ranges")', () => {
    mockedUseMovimientosClienteFiltrados.mockReturnValue({ movimientos: [], isLoading: false } as never)

    render(<ClienteDetalle onVolver={vi.fn()} cliente={cliente()} />)

    expect(mockedUseMovimientosClienteFiltrados).toHaveBeenCalledWith(
      'cli-1',
      { fechaDesde: '2026-05-01', fechaHasta: '2026-05-21' }
    )
  })

  it('un movimiento tipo SAL renderiza su etiqueta ("Saldo Anterior"), no el codigo crudo', () => {
    mockedUseMovimientosClienteFiltrados.mockReturnValue({
      movimientos: [movimiento({ id: 'mov-sal', tipo: 'SAL', referencia: 'SAL-INICIAL' })],
      isLoading: false,
    } as never)

    render(<ClienteDetalle onVolver={vi.fn()} cliente={cliente()} />)

    expect(screen.getByText('Saldo Anterior')).toBeInTheDocument()
  })
})

describe('ClienteDetalle — saldo query tenant-scoped (Spec: "Saldo query is tenant-scoped")', () => {
  it('la query de saldo_actual filtra WHERE id = ? AND empresa_id = ?, con user.empresa_id como param', () => {
    mockedUseMovimientosClienteFiltrados.mockReturnValue({ movimientos: [], isLoading: false } as never)

    render(<ClienteDetalle onVolver={vi.fn()} cliente={cliente({ id: 'cli-1' })} />)

    const saldoCall = mockedUseQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('saldo_actual')
    )
    expect(saldoCall).toBeDefined()
    expect(saldoCall![0]).toContain('WHERE id = ? AND empresa_id = ?')
    expect(saldoCall![1]).toEqual(['cli-1', 'emp-1'])
  })
})

describe('ClienteDetalle — precision de saldo, sin parseFloat (Spec: "Balance formatting preserves precision")', () => {
  it('formatUsd/usdToBs reciben el string crudo de saldo_actual, nunca un Number coercionado', () => {
    const formatUsdSpy = vi.spyOn(currency, 'formatUsd')
    const usdToBsSpy = vi.spyOn(currency, 'usdToBs')
    mockedUseMovimientosClienteFiltrados.mockReturnValue({ movimientos: [], isLoading: false } as never)
    mockedUseQuery.mockReturnValue({ data: [{ saldo_actual: '150.00000000' }], isLoading: false } as never)

    render(<ClienteDetalle onVolver={vi.fn()} cliente={cliente({ saldo_actual: '150.00000000' })} />)

    const saldoUsdCalls = formatUsdSpy.mock.calls.filter((call) => call[0] === '150.00000000')
    expect(saldoUsdCalls.length).toBeGreaterThan(0)
    const bsCall = usdToBsSpy.mock.calls.find((call) => call[0] === '150.00000000')
    expect(bsCall).toBeDefined()
    formatUsdSpy.mock.calls.forEach((call) => {
      expect(typeof call[0]).not.toBe('number')
    })
  })

  it('saldo negativo (a favor) se muestra en verde/credito — signo derivado de Decimal(saldoStr).comparedTo(0), no de un Number', () => {
    mockedUseMovimientosClienteFiltrados.mockReturnValue({ movimientos: [], isLoading: false } as never)
    mockedUseQuery.mockReturnValue({ data: [{ saldo_actual: '-30.00000000' }], isLoading: false } as never)

    render(<ClienteDetalle onVolver={vi.fn()} cliente={cliente({ saldo_actual: '-30.00000000' })} />)

    const saldoEl = screen.getByText('-$30.00')
    expect(saldoEl).toHaveClass('text-green-600')
  })

  it('saldo exactamente en cero se muestra en estilo neutral (ni rojo ni verde) — Decimal(0).isPositive() da true, por eso se exige comparedTo(0)', () => {
    mockedUseMovimientosClienteFiltrados.mockReturnValue({ movimientos: [], isLoading: false } as never)
    mockedUseQuery.mockReturnValue({ data: [{ saldo_actual: '0.00000000' }], isLoading: false } as never)

    render(<ClienteDetalle onVolver={vi.fn()} cliente={cliente({ saldo_actual: '0.00000000' })} />)

    const saldoEl = screen.getByText('$0.00')
    expect(saldoEl).toHaveClass('text-muted-foreground')
    expect(saldoEl).not.toHaveClass('text-red-600')
    expect(saldoEl).not.toHaveClass('text-green-600')
  })
})

describe('ClienteDetalle — pantalla dedicada (onClose renombrado a onVolver)', () => {
  it('Scenario: boton "Volver" invoca onVolver', () => {
    const onVolver = vi.fn()
    render(<ClienteDetalle cliente={CLIENTE} onVolver={onVolver} />)

    fireEvent.click(screen.getByRole('button', { name: /volver/i }))

    expect(onVolver).toHaveBeenCalledTimes(1)
  })

  it('Scenario: saldo con estilo segun estado real — el nombre y el saldo del cliente se muestran', () => {
    mockedUseQuery.mockReturnValue({ data: [{ saldo_actual: CLIENTE.saldo_actual }], isLoading: false } as never)

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.getByText('MARIA PEREZ')).toBeInTheDocument()
    expect(screen.getByText('$120.50')).toBeInTheDocument()
  })
})

describe('ClienteDetalle — seccion Facturas (cliente-detalle-pantalla, PR3)', () => {
  it('Scenario: con facturas devueltas por useFacturasEmpresa, renderiza la tabla con mostrarAcciones=false', () => {
    mockedUseFacturasEmpresa.mockReturnValue({
      facturas: [
        {
          id: 'venta-1',
          nro_factura: 'C01-000001',
          cliente_id: 'cli-1',
          cliente_nombre: 'MARIA PEREZ',
          cliente_identificacion: 'V-12345678',
          tasa: '36.50',
          total_usd: '100.00',
          total_bs: '3650.00',
          saldo_pend_usd: '0.00',
          tipo: 'CONTADO',
          fecha: '2026-05-10T10:00:00-04:00',
          tiene_reverso_total: 0,
          tiene_reverso_parcial: 0,
        },
      ],
      isLoading: false,
    } as never)

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.getByText(/facturas/i)).toBeInTheDocument()
    const tabla = screen.getByTestId('facturas-table')
    expect(tabla).toBeInTheDocument()
    expect(tabla).toHaveAttribute('data-mostrar-acciones', 'false')
  })

  it('Scenario: sin facturas, muestra estado vacio ("Sin facturas")', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: false })

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.getByText(/sin facturas/i)).toBeInTheDocument()
    expect(screen.queryByTestId('facturas-table')).not.toBeInTheDocument()
  })

  it('Scenario: mientras isLoading, muestra estado de carga en vez de la tabla', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: true })

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.queryByTestId('facturas-table')).not.toBeInTheDocument()
    expect(screen.queryByText(/sin facturas/i)).not.toBeInTheDocument()
  })

  it('Scenario: la seccion nunca expone la accion "Aplicar nota de credito" (mostrarAcciones=false)', () => {
    mockedUseFacturasEmpresa.mockReturnValue({
      facturas: [
        {
          id: 'venta-1',
          nro_factura: 'C01-000001',
          cliente_id: 'cli-1',
          cliente_nombre: 'MARIA PEREZ',
          cliente_identificacion: 'V-12345678',
          tasa: '36.50',
          total_usd: '100.00',
          total_bs: '3650.00',
          saldo_pend_usd: '0.00',
          tipo: 'CONTADO',
          fecha: '2026-05-10T10:00:00-04:00',
          tiene_reverso_total: 0,
          tiene_reverso_parcial: 0,
        },
      ],
      isLoading: false,
    } as never)

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /aplicar nota de credito/i })).not.toBeInTheDocument()
  })
})
