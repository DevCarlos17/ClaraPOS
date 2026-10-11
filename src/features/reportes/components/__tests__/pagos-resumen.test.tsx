// PagosResumen — Card "Cobros por Metodo de Pago". BUG A (sdd/cuadre-saf-generado-consumido):
// el guard de empty-state (antes: `metodosMostrar.length === 0 && cxcTotalUsd <= 0`) ignoraba
// el resto de los conceptos que la card puede renderizar (SAF consumido, diferencial cambiario,
// absorcion). Resultado: una sesion 100%-SAF (sin efectivo, sin CxC) caia en "Sin cobros en
// esta fecha" aunque el bloque "Saldo a favor aplicado" (ya escrito, L128-150) tuviera datos
// reales para mostrar. El fix amplia el guard para exigir que TODOS los conceptos esten vacios
// antes de mostrar el empty-state. Ver engram sdd/cuadre-saf-generado-consumido/analisis (#5305).
vi.mock('../../hooks/use-cuadre', () => ({
  usePagosPorMetodo: vi.fn(),
  useCxcDelDia: vi.fn(),
  useTotalesFiscales: vi.fn(),
  useSafDiario: vi.fn(),
  useAnticiposDelDia: vi.fn(),
  useCobrosViaPOS: vi.fn(),
  useDiferencialCambiarioDelDia: vi.fn(),
  useAbsorcionDelDia: vi.fn(),
}))

import { render, screen, within } from '@testing-library/react'
import { PagosResumen } from '../pagos-resumen'
import { formatUsd, formatBs } from '@/lib/currency'
import {
  usePagosPorMetodo,
  useCxcDelDia,
  useTotalesFiscales,
  useSafDiario,
  useAnticiposDelDia,
  useCobrosViaPOS,
  useDiferencialCambiarioDelDia,
  useAbsorcionDelDia,
} from '../../hooks/use-cuadre'

const mockedUsePagosPorMetodo = vi.mocked(usePagosPorMetodo)
const mockedUseCxcDelDia = vi.mocked(useCxcDelDia)
const mockedUseTotalesFiscales = vi.mocked(useTotalesFiscales)
const mockedUseSafDiario = vi.mocked(useSafDiario)
const mockedUseAnticiposDelDia = vi.mocked(useAnticiposDelDia)
const mockedUseCobrosViaPOS = vi.mocked(useCobrosViaPOS)
const mockedUseDiferencialCambiarioDelDia = vi.mocked(useDiferencialCambiarioDelDia)
const mockedUseAbsorcionDelDia = vi.mocked(useAbsorcionDelDia)

const filters = { fecha: '2026-10-11', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }

function setup(opts: {
  metodos?: Array<{ metodo_cobro_id: string; nombre: string; tipo: string; moneda: string; totalUsd: number; totalOriginal: number; totalBs: number }>
  cxcTotalUsd?: number
  cxcTotalBs?: number
  safTotalUsd?: number
  anticipoUsd?: number
  cobrosAnterioresUsd?: number
  cobrosAnterioresBsEquiv?: number
  totalVentasUsd?: number
  totalVentasBs?: number
  totalIgtfUsd?: number
  totalIgtfBs?: number
  hayDiferencial?: boolean
  hayAbsorcion?: boolean
}) {
  mockedUsePagosPorMetodo.mockReturnValue({
    metodos: opts.metodos ?? [],
    isLoading: false,
  } as never)
  mockedUseCxcDelDia.mockReturnValue({
    cxcTotalUsd: opts.cxcTotalUsd ?? 0,
    cxcTotalBs: opts.cxcTotalBs ?? 0,
    isLoading: false,
  } as never)
  mockedUseTotalesFiscales.mockReturnValue({
    totales: {
      totalVentasUsd: opts.totalVentasUsd ?? 0,
      totalVentasBs: opts.totalVentasBs ?? 0,
      totalIgtfUsd: opts.totalIgtfUsd ?? 0,
      totalIgtfBs: opts.totalIgtfBs ?? 0,
    },
    isLoading: false,
  } as never)
  mockedUseSafDiario.mockReturnValue({
    totalUsd: opts.safTotalUsd ?? 0,
    items: [],
    isLoading: false,
  } as never)
  mockedUseAnticiposDelDia.mockReturnValue({
    anticipoUsd: opts.anticipoUsd ?? 0,
    anticipoBsNativo: 0,
    isLoading: false,
  } as never)
  mockedUseCobrosViaPOS.mockReturnValue({
    porMetodo: [],
    totalCobrosUsd: opts.cobrosAnterioresUsd ?? 0,
    totalCobrosBs: 0,
    totalCobrosBsEquiv: opts.cobrosAnterioresBsEquiv ?? 0,
    isLoading: false,
  } as never)
  mockedUseDiferencialCambiarioDelDia.mockReturnValue({
    netoBs: opts.hayDiferencial ? 1000 : 0,
    netoUsd: opts.hayDiferencial ? 20 : 0,
    hayDiferencial: opts.hayDiferencial ?? false,
    isLoading: false,
  } as never)
  mockedUseAbsorcionDelDia.mockReturnValue({
    totalBs: opts.hayAbsorcion ? 500 : 0,
    totalUsd: opts.hayAbsorcion ? 10 : 0,
    hayAbsorcion: opts.hayAbsorcion ?? false,
    isLoading: false,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PagosResumen — guard de empty-state considera TODOS los conceptos (BUG A, sdd/cuadre-saf-generado-consumido)', () => {
  it('sin metodos de pago en efectivo pero CON SAF consumido (haySaf=true): muestra "Saldo a favor aplicado" y NO el empty-state', () => {
    setup({ metodos: [], cxcTotalUsd: 0, safTotalUsd: 650 })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Saldo a favor aplicado')).toBeInTheDocument()
    expect(screen.getByText('Credito consumido de clientes')).toBeInTheDocument()
    expect(screen.queryByText('Sin cobros en esta fecha')).not.toBeInTheDocument()
  })

  it('genuinely empty — sin metodos, sin SAF, sin CxC, sin diferencial, sin absorcion: SI muestra el empty-state', () => {
    setup({ metodos: [], cxcTotalUsd: 0, safTotalUsd: 0, hayDiferencial: false, hayAbsorcion: false })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Sin cobros en esta fecha')).toBeInTheDocument()
    expect(screen.queryByText('Saldo a favor aplicado')).not.toBeInTheDocument()
  })

  it('triangulacion: sin metodos, sin SAF, sin CxC, pero CON diferencial cambiario: NO cae en empty-state (prueba que el guard no es solo "!haySaf")', () => {
    setup({ metodos: [], cxcTotalUsd: 0, safTotalUsd: 0, hayDiferencial: true })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Diferencial cambiario')).toBeInTheDocument()
    expect(screen.queryByText('Sin cobros en esta fecha')).not.toBeInTheDocument()
  })

  it('triangulacion: sin metodos, sin SAF, sin CxC, sin diferencial, pero CON absorcion ("Negocio asume"): NO cae en empty-state', () => {
    setup({ metodos: [], cxcTotalUsd: 0, safTotalUsd: 0, hayAbsorcion: true })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Negocio asume')).toBeInTheDocument()
    expect(screen.queryByText('Sin cobros en esta fecha')).not.toBeInTheDocument()
  })

  it('triangulacion: CON metodos de pago en efectivo (caso ya-correcto previo al fix) sigue mostrando el contenido normal', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 100, totalOriginal: 100, totalBs: 4200 },
      ],
    })

    render(<PagosResumen filters={filters} tasaDelDia={42} />)

    expect(screen.getByText('Efectivo USD')).toBeInTheDocument()
    expect(screen.queryByText('Sin cobros en esta fecha')).not.toBeInTheDocument()
  })
})

// Partida doble de totales (sdd/cuadre-saf-generado-consumido/design-totales #5318):
// "Total cobrado" (cash-only) y "Total facturado" (recomputo local sin useTotalesFiscales)
// daban numeros incorrectos en escenarios con SAF consumido, cobros de CxC vieja o ventas a
// credito. El fix agrega "TOTAL COBRADO" (cash neto de cobros anteriores + SAF consumido +
// diferencial + absorcion), "Saldo a favor generado" (informativa, NO se resta ni se suma a
// ningun total) y "Saldó facturas" (TOTAL COBRADO + CxC pendiente), y re-fuente "Total
// facturado" desde useTotalesFiscales (dato fiscal real, ya fetcheado antes y descartado).
// Tabla de 5 escenarios: ver #5318.
const TASA = 42

describe('PagosResumen — totales de partida doble (design #5318, sdd/cuadre-saf-generado-consumido)', () => {
  it('Escenario A — solo efectivo: TOTAL COBRADO == Saldo facturas == Total facturado == 500', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 500, totalOriginal: 500, totalBs: 500 * TASA },
      ],
      totalVentasUsd: 500,
      totalVentasBs: 500 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(500))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(500 * TASA))).toBeInTheDocument()

    const saldoFacturas = within(screen.getByTestId('saldo-facturas'))
    expect(saldoFacturas.getByText(formatUsd(500))).toBeInTheDocument()
    expect(saldoFacturas.getByText(formatBs(500 * TASA))).toBeInTheDocument()

    const totalFacturado = within(screen.getByTestId('total-facturado'))
    expect(totalFacturado.getByText(formatUsd(500))).toBeInTheDocument()
    expect(totalFacturado.getByText(formatBs(500 * TASA))).toBeInTheDocument()

    expect(screen.queryByText('Cobros anteriores (CxC)')).not.toBeInTheDocument()
    expect(screen.queryByText('Saldo a favor generado')).not.toBeInTheDocument()
  })

  it('Escenario B — solo SAF consumido (sin efectivo): TOTAL COBRADO == Saldo facturas == Total facturado == 650', () => {
    setup({
      metodos: [],
      safTotalUsd: 650,
      totalVentasUsd: 650,
      totalVentasBs: 650 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    expect(screen.getByText('Saldo a favor aplicado')).toBeInTheDocument()

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(650))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(650 * TASA))).toBeInTheDocument()

    const saldoFacturas = within(screen.getByTestId('saldo-facturas'))
    expect(saldoFacturas.getByText(formatUsd(650))).toBeInTheDocument()

    const totalFacturado = within(screen.getByTestId('total-facturado'))
    expect(totalFacturado.getByText(formatUsd(650))).toBeInTheDocument()
  })

  it('Escenario C — mixto (ref #5317, corregido por #5332): cash GROSS 1000 (incluye excedente de A) + SAF consumido 650 (B), SAF generado 350 SE RESTA de Saldo facturas y la fila "Saldo a favor generado" NO se muestra en Card 1: TOTAL COBRADO == 1650, Saldo facturas == Total facturado == 1300', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 1000, totalOriginal: 1000, totalBs: 1000 * TASA },
      ],
      safTotalUsd: 650,
      anticipoUsd: 350,
      totalVentasUsd: 1300,
      totalVentasBs: 1300 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(1650))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(1650 * TASA))).toBeInTheDocument()

    const saldoFacturas = within(screen.getByTestId('saldo-facturas'))
    expect(saldoFacturas.getByText(formatUsd(1300))).toBeInTheDocument()
    expect(saldoFacturas.getByText(formatBs(1300 * TASA))).toBeInTheDocument()

    const totalFacturado = within(screen.getByTestId('total-facturado'))
    expect(totalFacturado.getByText(formatUsd(1300))).toBeInTheDocument()

    // Saldo a favor generado (#5332): SU VALOR se resta en el computo de Saldo facturas,
    // pero la fila ya NO se renderiza en Card 1 (pertenece solo a Card 2, "Cobros por Adelantado")
    expect(screen.queryByTestId('saf-generado')).not.toBeInTheDocument()
    expect(screen.queryByText('Saldo a favor generado')).not.toBeInTheDocument()
  })

  it('Escenario H — bug de staging (#5332): 2000 cash GROSS / factura 650 / 1350 SAF generado: TOTAL COBRADO == 2000, Saldo facturas == Total facturado == 650, fila "Saldo a favor generado" AUSENTE en Card 1', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 2000, totalOriginal: 2000, totalBs: 2000 * TASA },
      ],
      anticipoUsd: 1350,
      totalVentasUsd: 650,
      totalVentasBs: 650 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(2000))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(2000 * TASA))).toBeInTheDocument()

    const saldoFacturas = within(screen.getByTestId('saldo-facturas'))
    expect(saldoFacturas.getByText(formatUsd(650))).toBeInTheDocument()
    expect(saldoFacturas.getByText(formatBs(650 * TASA))).toBeInTheDocument()

    const totalFacturado = within(screen.getByTestId('total-facturado'))
    expect(totalFacturado.getByText(formatUsd(650))).toBeInTheDocument()
    expect(totalFacturado.getByText(formatBs(650 * TASA))).toBeInTheDocument()

    expect(screen.queryByTestId('saf-generado')).not.toBeInTheDocument()
    expect(screen.queryByText('Saldo a favor generado')).not.toBeInTheDocument()
  })

  it('Escenario D — CxC vieja cobrada hoy (overcount): cash bruto 700, cobros anteriores 200 se RESTAN -> TOTAL COBRADO == Saldo facturas == Total facturado == 500 (NO 700)', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 700, totalOriginal: 700, totalBs: 700 * TASA },
      ],
      cobrosAnterioresUsd: 200,
      cobrosAnterioresBsEquiv: 200 * TASA,
      totalVentasUsd: 500,
      totalVentasBs: 500 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const cobrosAnteriores = within(screen.getByTestId('cobros-anteriores'))
    expect(cobrosAnteriores.getByText(`-${formatUsd(200)}`)).toBeInTheDocument()

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(500))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(500 * TASA))).toBeInTheDocument()
    expect(totalCobrado.queryByText(formatUsd(700))).not.toBeInTheDocument()

    const saldoFacturas = within(screen.getByTestId('saldo-facturas'))
    expect(saldoFacturas.getByText(formatUsd(500))).toBeInTheDocument()

    const totalFacturado = within(screen.getByTestId('total-facturado'))
    expect(totalFacturado.getByText(formatUsd(500))).toBeInTheDocument()
  })

  it('Escenario E — venta a credito pura: TOTAL COBRADO == 0, Saldo facturas == Total facturado == 400 (incluye CxC pendiente)', () => {
    setup({
      metodos: [],
      cxcTotalUsd: 400,
      cxcTotalBs: 400 * TASA,
      totalVentasUsd: 400,
      totalVentasBs: 400 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    expect(screen.getByText('A credito (CxC)')).toBeInTheDocument()

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(0))).toBeInTheDocument()

    const saldoFacturas = within(screen.getByTestId('saldo-facturas'))
    expect(saldoFacturas.getByText(formatUsd(400))).toBeInTheDocument()
    expect(saldoFacturas.getByText(formatBs(400 * TASA))).toBeInTheDocument()

    const totalFacturado = within(screen.getByTestId('total-facturado'))
    expect(totalFacturado.getByText(formatUsd(400))).toBeInTheDocument()
    expect(totalFacturado.getByText(formatBs(400 * TASA))).toBeInTheDocument()
  })

  // Cobertura de brecha detectada en review (PASS WITH WARNINGS): los 5 escenarios A-E
  // solo aseveraban VISIBILIDAD de la fila "Diferencial cambiario"/"Negocio asume", nunca
  // el valor NUMERICO de TOTAL COBRADO / Saldo facturas cuando esos conceptos suman dinero
  // real a la fórmula (design #5318: `TOTAL_COBRADO = cashNeto + safConsumido + diferencial
  // + absorcion`). Escenario F cubre diferencial, Escenario G cubre absorcion (caminos
  // independientes — hooks distintos, flags distintos). `setup()` fija netoBs=1000 cuando
  // hayDiferencial=true y totalBs=500 cuando hayAbsorcion=true; el componente NO usa el
  // campo *Usd del hook directamente para el total — recalcula desde Bs/tasaDelDia
  // (`diferencialNetoUsdCalc = diferencialNetoBs / tasaDelDia`, idem absorcion). Los
  // valores esperados abajo replican esa misma formula con la misma aritmetica de punto
  // flotante y el mismo orden de sumandos que el componente, para garantizar coincidencia
  // bit-a-bit en el string formateado (`formatUsd` redondea a 2 decimales al final).
  it('Escenario F — cash + diferencial cambiario activo: TOTAL COBRADO y Saldo facturas incluyen el aporte del diferencial (diferencialNetoBs / tasaDelDia)', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 300, totalOriginal: 300, totalBs: 300 * TASA },
      ],
      hayDiferencial: true, // setup() fija netoBs=1000, netoUsd=20 para este flag
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    // Replica EXACTA de la formula del componente: cashNetoUsd + safTotalUsd(0)
    // + (hayDiferencial ? diferencialNetoBs/tasaDelDia : 0) + absorcion(0)
    const diferencialNetoBs = 1000
    const diferencialContribUsd = diferencialNetoBs / TASA
    const expectedTotalCobradoUsd = 300 + diferencialContribUsd
    const expectedTotalCobradoBs = 300 * TASA + diferencialNetoBs

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(expectedTotalCobradoUsd))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(expectedTotalCobradoBs))).toBeInTheDocument()
    // Si el termino del diferencial se perdiera, TOTAL COBRADO caeria al cash puro (300) —
    // este assert negativo prueba que la fila no se quedo en el valor pre-diferencial.
    expect(totalCobrado.queryByText(formatUsd(300))).not.toBeInTheDocument()

    const saldoFacturas = within(screen.getByTestId('saldo-facturas'))
    expect(saldoFacturas.getByText(formatUsd(expectedTotalCobradoUsd))).toBeInTheDocument()
    expect(saldoFacturas.getByText(formatBs(expectedTotalCobradoBs))).toBeInTheDocument()
  })

  it('Escenario G — cash + negocio asume (absorcion) activo: TOTAL COBRADO y Saldo facturas incluyen el aporte de la absorcion (absorcionBs / tasaDelDia)', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 200, totalOriginal: 200, totalBs: 200 * TASA },
      ],
      hayAbsorcion: true, // setup() fija totalBs=500, totalUsd=10 para este flag
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    // Replica EXACTA de la formula del componente: cashNetoUsd + safTotalUsd(0)
    // + diferencial(0) + (hayAbsorcion ? absorcionBs/tasaDelDia : 0)
    const absorcionBs = 500
    const absorcionContribUsd = absorcionBs / TASA
    const expectedTotalCobradoUsd = 200 + absorcionContribUsd
    const expectedTotalCobradoBs = 200 * TASA + absorcionBs

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(expectedTotalCobradoUsd))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(expectedTotalCobradoBs))).toBeInTheDocument()
    // Si el termino de absorcion se perdiera, TOTAL COBRADO caeria al cash puro (200).
    expect(totalCobrado.queryByText(formatUsd(200))).not.toBeInTheDocument()

    const saldoFacturas = within(screen.getByTestId('saldo-facturas'))
    expect(saldoFacturas.getByText(formatUsd(expectedTotalCobradoUsd))).toBeInTheDocument()
    expect(saldoFacturas.getByText(formatBs(expectedTotalCobradoBs))).toBeInTheDocument()
  })
})
