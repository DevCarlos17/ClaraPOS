import { renderHook } from '@testing-library/react'
import {
  buildReciboDataDesdeFacturaGuardada,
  useReciboDesdeFactura,
} from '../recibo-desde-factura'
import { useDetalleFactura, usePagosFactura, type EvolucionFacturaRow } from '@/features/cxc/hooks/use-cxc'
import { useEvolucionFactura } from '@/features/cxc/hooks/use-cxc'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { useReversosFactura, type ReversoFacturaRow } from '../../hooks/use-notas-credito'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import type { FacturaParaAnular } from '../../hooks/use-notas-credito'
import type { DetalleFacturaCxc, PagoFacturaCxc } from '@/features/cxc/hooks/use-cxc'
import type { Company } from '@/features/configuracion/hooks/use-company'
import type { ReciboEvolucionInput } from '../factura-export'

// `use-company.ts` importa `@/core/db/kysely/kysely`, que instancia `PowerSyncDatabase`
// al cargar el modulo (efecto lateral top-level). Mockeamos el constructor para poder
// usar `importOriginal` y conservar `parseEmpresaConfig` real (mismo patron que
// `venta-exitosa-modal.test.tsx`).
vi.mock('@powersync/web', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return { ...actual, PowerSyncDatabase: vi.fn().mockImplementation(() => ({})) }
})

vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  useDetalleFactura: vi.fn(),
  usePagosFactura: vi.fn(),
  useEvolucionFactura: vi.fn(),
}))

vi.mock('@/features/configuracion/hooks/use-company', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/configuracion/hooks/use-company')>()
  return { ...actual, useCompany: vi.fn() }
})

vi.mock('../../hooks/use-notas-credito', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/use-notas-credito')>()
  return { ...actual, useReversosFactura: vi.fn() }
})

vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

const mockedUseDetalleFactura = vi.mocked(useDetalleFactura)
const mockedUsePagosFactura = vi.mocked(usePagosFactura)
const mockedUseCompany = vi.mocked(useCompany)
const mockedUseEvolucionFactura = vi.mocked(useEvolucionFactura)
const mockedUseReversosFactura = vi.mocked(useReversosFactura)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

function baseEvolucion(overrides: Partial<ReturnType<typeof useEvolucionFactura>> = {}): ReturnType<typeof useEvolucionFactura> {
  return {
    abonos: [],
    reversosPago: [],
    saldoAFavor: [],
    isLoading: false,
    ...overrides,
  }
}

function baseReversoRow(overrides: Partial<ReversoFacturaRow> = {}): ReversoFacturaRow {
  return {
    nota_credito_id: 'nc-1',
    nro_ncr: 'NCR-000001',
    tipo: 'PARCIAL',
    fecha: '2026-08-14T10:00:00.000-04:00',
    venta_det_id: 'det-1',
    producto_descripcion: 'Botox 50U',
    cantidad: '1',
    total_usd: '10.00',
    total_bs: '400.00',
    ...overrides,
  }
}

function baseEvolucionRow(overrides: Partial<EvolucionFacturaRow> = {}): EvolucionFacturaRow {
  return {
    tipo: 'PAG',
    monto: '10.00',
    tasa_pago: '40.0000',
    fecha: '2026-08-15T10:00:00.000-04:00',
    referencia: 'PAG-C01-000001',
    observacion: 'Pago factura C01-000001',
    ...overrides,
  }
}

function baseFactura(overrides: Partial<FacturaParaAnular> = {}): FacturaParaAnular {
  return {
    id: 'venta-1',
    nro_factura: 'C01-000001',
    cliente_id: 'cli-1',
    cliente_nombre: 'Maria Perez',
    cliente_identificacion: 'V-12345678',
    tasa: '40.0000',
    total_usd: '30.00',
    total_bs: '1200.00',
    saldo_pend_usd: '0.00',
    tipo: 'CONTADO',
    fecha: '2026-08-13T10:30:00.000-04:00',
    ...overrides,
  }
}

function baseDetalle(overrides: Partial<DetalleFacturaCxc> = {}): DetalleFacturaCxc {
  return {
    id: 'det-1',
    venta_id: 'venta-1',
    producto_id: 'prod-1',
    cantidad: '2',
    precio_unitario_usd: '15.00',
    subtotal_usd: '30.00',
    subtotal_bs: '1200.00',
    producto_nombre: 'Botox 50U',
    producto_codigo: 'BOTOX-50',
    tipo_impuesto: 'Gravable',
    impuesto_pct: '16',
    es_decimal: 0,
    precio_unitario_bs: '600.00',
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

function baseCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'emp-1',
    tenant_id: 'tenant-1',
    nombre: 'ClaraPOS Estetica C.A.',
    rif: 'J-12345678-9',
    direccion: 'Av. Principal, Caracas',
    telefono: '0412-1234567',
    email: 'empresa@email.com',
    logo_url: null,
    timezone: 'America/Caracas',
    moneda_base: 'USD',
    config: '{}',
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('buildReciboDataDesdeFacturaGuardada', () => {
  it('mapea factura+detalle+pagos+company al ReciboData exacto que producian los modales inline (T2-01)', () => {
    const factura = baseFactura()
    const detalle = [baseDetalle()]
    const pagos = [basePago()]
    const company = baseCompany()

    const recibo = buildReciboDataDesdeFacturaGuardada(factura, detalle, pagos, company)

    expect(recibo.nroFactura).toBe('C01-000001')
    expect(recibo.fecha).toBe('2026-08-13T10:30:00.000-04:00')
    expect(recibo.emisor).toEqual({
      nombre: 'ClaraPOS Estetica C.A.',
      rif: 'J-12345678-9',
      direccion: 'Av. Principal, Caracas',
    })
    expect(recibo.cliente).toEqual({
      nombre: 'Maria Perez',
      identificacion: 'V-12345678',
      direccion: null,
    })
    expect(recibo.lineas).toHaveLength(1)
    expect(recibo.lineas[0]).toMatchObject({
      codigo: 'BOTOX-50',
      nombre: 'Botox 50U',
      esExento: false,
      cantidad: 2,
      precioUnitarioUsd: 15,
    })
    expect(recibo.pagos).toHaveLength(1)
    expect(recibo.pagos[0]).toMatchObject({ metodoNombre: 'Efectivo USD' })
    // linea gravable 16%: base 30 + IVA 4.8 = 34.8
    expect(recibo.totales.totalFacturaUsd).toBe(34.8)
    // No `esReimpresion`/`monedaPresentacion` en opts -> defaults de buildReciboData.
    expect(recibo.esReimpresion).toBe(false)
    expect(recibo.monedaPresentacion).toBe('USD')
  })

  it('mapea correctamente una linea exonerada via toTipoImpuestoLinea (triangulacion: distinto tipo_impuesto)', () => {
    const factura = baseFactura()
    const detalle = [baseDetalle({ tipo_impuesto: 'Exonerado', impuesto_pct: '0' })]
    const pagos: PagoFacturaCxc[] = []
    const company = baseCompany()

    const recibo = buildReciboDataDesdeFacturaGuardada(factura, detalle, pagos, company)

    expect(recibo.lineas[0].esExento).toBe(true)
    expect(recibo.totales.montoExentoUsd).toBe(30)
  })

  it('un tipo_impuesto desconocido cae a Exento (misma regla que toTipoImpuestoLinea original)', () => {
    const factura = baseFactura()
    const detalle = [baseDetalle({ tipo_impuesto: 'ALGO_RARO' })]
    const company = baseCompany()

    const recibo = buildReciboDataDesdeFacturaGuardada(factura, detalle, [], company)

    expect(recibo.lineas[0].esExento).toBe(true)
  })

  it('igtfUsd es null cuando total_igtf_usd es 0/ausente, y numerico cuando > 0 (paridad con el mapeo original)', () => {
    const facturaSinIgtf = baseFactura({ total_igtf_usd: '0' })
    const reciboSinIgtf = buildReciboDataDesdeFacturaGuardada(facturaSinIgtf, [], [], baseCompany())
    expect(reciboSinIgtf.totales.igtfUsd).toBeNull()

    const facturaConIgtf = baseFactura({ total_igtf_usd: '3.5' })
    const reciboConIgtf = buildReciboDataDesdeFacturaGuardada(facturaConIgtf, [], [], baseCompany())
    expect(reciboConIgtf.totales.igtfUsd).toBe(3.5)
  })

  it('company null cae a strings vacios/null en emisor (mismo fallback `?? \'\'`/`?? null` del mapeo original)', () => {
    const recibo = buildReciboDataDesdeFacturaGuardada(baseFactura(), [], [], null)
    expect(recibo.emisor).toEqual({ nombre: '', rif: null, direccion: null })
  })

  it('opts.esReimpresion y opts.monedaPresentacion pasan sin cambios al ReciboData (T2-03, opt-in passthrough)', () => {
    const recibo = buildReciboDataDesdeFacturaGuardada(baseFactura(), [], [], baseCompany(), {
      esReimpresion: true,
      monedaPresentacion: 'BS',
    })

    expect(recibo.esReimpresion).toBe(true)
    expect(recibo.monedaPresentacion).toBe('BS')
  })

  it('opts.esReimpresion:false explicito produce esReimpresion false (triangulacion del passthrough)', () => {
    const recibo = buildReciboDataDesdeFacturaGuardada(baseFactura(), [], [], baseCompany(), {
      esReimpresion: false,
    })

    expect(recibo.esReimpresion).toBe(false)
  })

  it('sin el parametro evolucion (omitido), recibo.evolucion es undefined (PR4, additive default)', () => {
    const recibo = buildReciboDataDesdeFacturaGuardada(baseFactura(), [], [], baseCompany())
    expect(recibo.evolucion).toBeUndefined()
  })

  it('con evolucion poblada, recibo.evolucion refleja los movimientos pasados (PR4)', () => {
    const evolucion: ReciboEvolucionInput = {
      abonos: [{ fecha: '2026-08-15', monto: 10, tasaPago: 40 }],
    }
    const recibo = buildReciboDataDesdeFacturaGuardada(baseFactura(), [], [], baseCompany(), undefined, evolucion)

    expect(recibo.evolucion).toEqual({
      reversos: [],
      abonos: [{ fecha: '2026-08-15', montoUsd: 10, montoBs: 400 }],
      reversosPago: [],
      saldoAFavorGeneradoUsd: null,
      saldoAFavorGeneradoBs: null,
    })
  })
})

describe('useReciboDesdeFactura', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseCurrentUser.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'cajero@email.com',
        nombre: 'Cajero',
        level: 3,
        rol_id: null,
        rol_nombre: null,
        empresa_id: 'emp-1',
      },
      loading: false,
    })
    mockedUseReversosFactura.mockReturnValue({ reversos: [], isLoading: false })
    mockedUseEvolucionFactura.mockReturnValue(baseEvolucion())
  })

  it('venta === null retorna { recibo: null, isLoading: false } sin consultar company/detalle en estado loading', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({ company: null, isLoading: false })

    const { result } = renderHook(() => useReciboDesdeFactura(null))

    expect(result.current).toEqual({ recibo: null, isLoading: false })
  })

  it('mientras cualquier fuente esta cargando retorna { recibo: null, isLoading: true }', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: true })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })

    const { result } = renderHook(() => useReciboDesdeFactura(baseFactura()))

    expect(result.current).toEqual({ recibo: null, isLoading: true })
  })

  it('usePagosFactura cargando tambien produce isLoading:true (triangulacion: distinta fuente en loading)', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: true })
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })

    const { result } = renderHook(() => useReciboDesdeFactura(baseFactura()))

    expect(result.current).toEqual({ recibo: null, isLoading: true })
  })

  it('una vez resueltas todas las fuentes retorna { recibo: ReciboData, isLoading: false }', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [baseDetalle()], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [basePago()], isLoading: false })
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })

    const { result } = renderHook(() => useReciboDesdeFactura(baseFactura()))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.recibo).not.toBeNull()
    expect(result.current.recibo?.nroFactura).toBe('C01-000001')
    expect(result.current.recibo?.esReimpresion).toBe(false)
  })

  it('opts.esReimpresion:true se refleja en el recibo resuelto', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })

    const { result } = renderHook(() => useReciboDesdeFactura(baseFactura(), { esReimpresion: true }))

    expect(result.current.recibo?.esReimpresion).toBe(true)
  })

  it('derivarMonedaPresentacion:true lee moneda_presentacion_documentos de company.config', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({
      company: baseCompany({ config: JSON.stringify({ moneda_presentacion_documentos: 'BS' }) }),
      isLoading: false,
    })

    const { result } = renderHook(() =>
      useReciboDesdeFactura(baseFactura(), { derivarMonedaPresentacion: true })
    )

    expect(result.current.recibo?.monedaPresentacion).toBe('BS')
  })

  it('derivarMonedaPresentacion omitido (default) NO deriva de company.config — queda en el default USD de buildReciboData (paridad con los 2 modales NC)', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({
      company: baseCompany({ config: JSON.stringify({ moneda_presentacion_documentos: 'BS' }) }),
      isLoading: false,
    })

    const { result } = renderHook(() => useReciboDesdeFactura(baseFactura()))

    expect(result.current.recibo?.monedaPresentacion).toBe('USD')
  })

  it('empresaId de useCurrentUser se pasa a useReversosFactura y useEvolucionFactura (PR4)', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })
    mockedUseCurrentUser.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'cajero@email.com',
        nombre: 'Cajero',
        level: 3,
        rol_id: null,
        rol_nombre: null,
        empresa_id: 'emp-42',
      },
      loading: false,
    })

    renderHook(() => useReciboDesdeFactura(baseFactura()))

    expect(mockedUseReversosFactura).toHaveBeenCalledWith('venta-1', 'emp-42')
    expect(mockedUseEvolucionFactura).toHaveBeenCalledWith('venta-1', 'emp-42')
  })

  it('useReversosFactura cargando produce isLoading:true (PR4, agregacion extendida)', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })
    mockedUseReversosFactura.mockReturnValue({ reversos: [], isLoading: true })

    const { result } = renderHook(() => useReciboDesdeFactura(baseFactura()))

    expect(result.current).toEqual({ recibo: null, isLoading: true })
  })

  it('useEvolucionFactura cargando produce isLoading:true (PR4, agregacion extendida)', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })
    mockedUseEvolucionFactura.mockReturnValue(baseEvolucion({ isLoading: true }))

    const { result } = renderHook(() => useReciboDesdeFactura(baseFactura()))

    expect(result.current).toEqual({ recibo: null, isLoading: true })
  })

  it('sin reversos ni movimientos de evolucion, recibo.evolucion queda undefined (byte-identical guard, PR4)', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })

    const { result } = renderHook(() => useReciboDesdeFactura(baseFactura()))

    expect(result.current.recibo?.evolucion).toBeUndefined()
  })

  it('con reversos + abonos + reversoPago + saldoAFavor poblados, recibo.evolucion se compone correctamente (PR4)', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
    mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
    mockedUseCompany.mockReturnValue({ company: baseCompany(), isLoading: false })
    mockedUseReversosFactura.mockReturnValue({ reversos: [baseReversoRow()], isLoading: false })
    mockedUseEvolucionFactura.mockReturnValue(
      baseEvolucion({
        abonos: [baseEvolucionRow({ tipo: 'PAG', monto: '10.00', tasa_pago: '40.0000', fecha: '2026-08-15' })],
        reversosPago: [baseEvolucionRow({ tipo: 'REV', monto: '3.00', tasa_pago: '40.0000', fecha: '2026-08-16' })],
        saldoAFavor: [baseEvolucionRow({ tipo: 'SAFC', monto: '2.00', tasa_pago: '40.0000', fecha: '2026-08-17' })],
      })
    )

    const { result } = renderHook(() => useReciboDesdeFactura(baseFactura()))

    expect(result.current.recibo?.evolucion).toEqual({
      reversos: [{ nroNcr: 'NCR-000001', tipo: 'PARCIAL', fecha: '2026-08-14T10:00:00.000-04:00', montoUsd: 10, montoBs: 400 }],
      abonos: [{ fecha: '2026-08-15', montoUsd: 10, montoBs: 400 }],
      reversosPago: [{ fecha: '2026-08-16', montoUsd: 3, montoBs: 120 }],
      saldoAFavorGeneradoUsd: 2,
      saldoAFavorGeneradoBs: 80,
    })
  })
})
