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

  it('Escenario C — mixto (ref #5317): cash 650 + SAF consumido 650, SAF generado 350 informativo (NO se resta): TOTAL COBRADO == Saldo facturas == Total facturado == 1300', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 650, totalOriginal: 650, totalBs: 650 * TASA },
      ],
      safTotalUsd: 650,
      anticipoUsd: 350,
      totalVentasUsd: 1300,
      totalVentasBs: 1300 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(1300))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(1300 * TASA))).toBeInTheDocument()

    const saldoFacturas = within(screen.getByTestId('saldo-facturas'))
    expect(saldoFacturas.getByText(formatUsd(1300))).toBeInTheDocument()

    const totalFacturado = within(screen.getByTestId('total-facturado'))
    expect(totalFacturado.getByText(formatUsd(1300))).toBeInTheDocument()

    // Saldo a favor generado es INFORMATIVO — visible pero NO restado de ningun total
    const safGenerado = within(screen.getByTestId('saf-generado'))
    expect(safGenerado.getByText(formatUsd(350))).toBeInTheDocument()
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
})
