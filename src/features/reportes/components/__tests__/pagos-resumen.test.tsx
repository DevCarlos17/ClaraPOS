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
  useDiferencialCambiarioDelDia: vi.fn(),
  useAbsorcionDelDia: vi.fn(),
  useMovimientosManualesDia: vi.fn(),
  useDevolucionTesoreriaNC: vi.fn(),
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
  useDiferencialCambiarioDelDia,
  useAbsorcionDelDia,
  useMovimientosManualesDia,
  useDevolucionTesoreriaNC,
} from '../../hooks/use-cuadre'

const mockedUsePagosPorMetodo = vi.mocked(usePagosPorMetodo)
const mockedUseCxcDelDia = vi.mocked(useCxcDelDia)
const mockedUseTotalesFiscales = vi.mocked(useTotalesFiscales)
const mockedUseSafDiario = vi.mocked(useSafDiario)
const mockedUseAnticiposDelDia = vi.mocked(useAnticiposDelDia)
const mockedUseDiferencialCambiarioDelDia = vi.mocked(useDiferencialCambiarioDelDia)
const mockedUseAbsorcionDelDia = vi.mocked(useAbsorcionDelDia)
const mockedUseMovimientosManualesDia = vi.mocked(useMovimientosManualesDia)
const mockedUseDevolucionTesoreriaNC = vi.mocked(useDevolucionTesoreriaNC)

const filters = { fecha: '2026-10-11', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }

function setup(opts: {
  metodos?: Array<{ metodo_cobro_id: string; nombre: string; tipo: string; moneda: string; totalUsd: number; totalOriginal: number; totalBs: number }>
  cxcTotalUsd?: number
  cxcTotalBs?: number
  safTotalUsd?: number
  anticipoUsd?: number
  totalVentasUsd?: number
  totalVentasBs?: number
  totalIgtfUsd?: number
  totalIgtfBs?: number
  hayDiferencial?: boolean
  hayAbsorcion?: boolean
  movimientosManuales?: Array<{ metodo_tipo: string; metodo_moneda: string; mov_tipo: string; origen: string; total: number }>
  devolucionTesoreriaUsd?: number
  devolucionTesoreriaBs?: number
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
  mockedUseMovimientosManualesDia.mockReturnValue({
    movimientos: opts.movimientosManuales ?? [],
    isLoading: false,
  } as never)
  mockedUseDevolucionTesoreriaNC.mockReturnValue({
    totalUsd: opts.devolucionTesoreriaUsd ?? 0,
    totalBs: opts.devolucionTesoreriaBs ?? 0,
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
// "Total cobrado" (cash-only) daba numeros incorrectos en escenarios con SAF consumido,
// cobros de CxC vieja o ventas a credito. El fix agrega "TOTAL COBRADO" (cash neto de
// cobros anteriores + SAF consumido + diferencial + absorcion). Tabla de escenarios: ver
// #5318.
//
// REORDER (sdd/cuadre-reordenar-cards): "Saldó facturas" y "Total facturado" se QUITAN de
// esta card (Card derecha). "Total Facturado" ahora vive solo en Card izquierda (Resumen de
// Caja). "Saldó facturas" ya no aporta nada distinto de TOTAL COBRADO una vez que SAF
// generado se muestra como informativo en Card izquierda. TOTAL COBRADO sigue siendo la
// ultima fila visible de esta card.
const TASA = 42

describe('PagosResumen — totales de partida doble (design #5318, sdd/cuadre-saf-generado-consumido)', () => {
  it('Escenario A — solo efectivo: TOTAL COBRADO == 500; "Saldó facturas" y "Total facturado" AUSENTES de esta card', () => {
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

    expect(screen.queryByTestId('saldo-facturas')).not.toBeInTheDocument()
    expect(screen.queryByTestId('total-facturado')).not.toBeInTheDocument()
    expect(screen.queryByText('Cobros anteriores (CxC)')).not.toBeInTheDocument()
    expect(screen.queryByText('Saldo a favor generado')).not.toBeInTheDocument()
  })

  it('Escenario B — solo SAF consumido (sin efectivo): TOTAL COBRADO == 650; "Saldó facturas" y "Total facturado" AUSENTES', () => {
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

    expect(screen.queryByTestId('saldo-facturas')).not.toBeInTheDocument()
    expect(screen.queryByTestId('total-facturado')).not.toBeInTheDocument()
  })

  it('Escenario C — mixto (ref #5317, corregido por #5332): cash GROSS 1000 (incluye excedente de A) + SAF consumido 650 (B): TOTAL COBRADO == 1650; "Saldo a favor generado" y "Saldó facturas"/"Total facturado" AUSENTES de esta card', () => {
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

    // Saldo a favor generado: la fila ya NO se renderiza en esta card (pertenece solo a
    // Card izquierda, "Cobros por Adelantado"). "Saldó facturas"/"Total facturado" tampoco.
    expect(screen.queryByTestId('saf-generado')).not.toBeInTheDocument()
    expect(screen.queryByText('Saldo a favor generado')).not.toBeInTheDocument()
    expect(screen.queryByTestId('saldo-facturas')).not.toBeInTheDocument()
    expect(screen.queryByTestId('total-facturado')).not.toBeInTheDocument()
  })

  it('Escenario H — bug de staging (#5332): 2000 cash GROSS / factura 650 / 1350 SAF generado: TOTAL COBRADO == 2000; "Saldo a favor generado", "Saldó facturas" y "Total facturado" AUSENTES en esta card', () => {
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

    expect(screen.queryByTestId('saf-generado')).not.toBeInTheDocument()
    expect(screen.queryByText('Saldo a favor generado')).not.toBeInTheDocument()
    expect(screen.queryByTestId('saldo-facturas')).not.toBeInTheDocument()
    expect(screen.queryByTestId('total-facturado')).not.toBeInTheDocument()
  })

  it('Escenario D — CxC vieja cobrada hoy (owner-confirmed): cash bruto 700 (incluye 200 de CxC vieja) NO se resta -> TOTAL COBRADO == 700 (dinero real en caja); fila negativa "Cobros anteriores (CxC)" fue ELIMINADA (sdd/cuadre-cobros-anteriores-y-neto-sesion)', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 700, totalOriginal: 700, totalBs: 700 * TASA },
      ],
      totalVentasUsd: 500,
      totalVentasBs: 500 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    // La fila negativa "Cobros anteriores (CxC)" fue eliminada — era resta huerfana
    // de una comparacion ("Saldó facturas") ya quitada en PR#226. El efectivo de CxC
    // vieja ES dinero real en caja y debe contar en TOTAL COBRADO.
    expect(screen.queryByTestId('cobros-anteriores')).not.toBeInTheDocument()
    expect(screen.queryByText('Cobros anteriores (CxC)')).not.toBeInTheDocument()

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(700))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(700 * TASA))).toBeInTheDocument()
    expect(totalCobrado.queryByText(formatUsd(500))).not.toBeInTheDocument()

    expect(screen.queryByTestId('saldo-facturas')).not.toBeInTheDocument()
    expect(screen.queryByTestId('total-facturado')).not.toBeInTheDocument()
  })

  it('Escenario owner — ejemplo completo del owner: cash bruto 2699.99 (incluye 99.99 CxC vieja) + SAF aplicado 650 -> TOTAL COBRADO == 3349.99', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 2699.99, totalOriginal: 2699.99, totalBs: 2699.99 * TASA },
      ],
      safTotalUsd: 650,
      totalVentasUsd: 1950,
      totalVentasBs: 1950 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(3349.99))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(3349.99 * TASA))).toBeInTheDocument()
  })

  it('Escenario E — venta a credito pura: TOTAL COBRADO == 0; "A credito (CxC)" visible; "Saldó facturas"/"Total facturado" AUSENTES de esta card', () => {
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

    expect(screen.queryByTestId('saldo-facturas')).not.toBeInTheDocument()
    expect(screen.queryByTestId('total-facturado')).not.toBeInTheDocument()
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

    expect(screen.queryByTestId('saldo-facturas')).not.toBeInTheDocument()
    expect(screen.queryByTestId('total-facturado')).not.toBeInTheDocument()
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

    expect(screen.queryByTestId('saldo-facturas')).not.toBeInTheDocument()
    expect(screen.queryByTestId('total-facturado')).not.toBeInTheDocument()
  })
})

// TOTAL NETO SESIÓN en Card derecha (sdd/cuadre-total-neto-sesion-right): segundo total que
// espeja la Card izquierda (Resumen de Caja), para que ambas cards muestren el mismo gran
// total. Formula: TOTAL NETO SESION = TOTAL COBRADO + "A credito (CxC)" pendiente. TOTAL
// COBRADO en si NO cambia (sigue excluyendo CxC) — el nuevo total es un segundo total que se
// agrega DESPUES de la fila de CxC, no un reemplazo.
describe('PagosResumen — TOTAL NETO SESIÓN (segundo total, sdd/cuadre-total-neto-sesion-right)', () => {
  it('con CxC pendiente > 0: TOTAL NETO SESION = TOTAL COBRADO + CxC; TOTAL COBRADO permanece SIN CAMBIOS', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 2699.99, totalOriginal: 2699.99, totalBs: 2699.99 * TASA },
      ],
      safTotalUsd: 650,
      cxcTotalUsd: 400,
      cxcTotalBs: 400 * TASA,
      totalVentasUsd: 1950,
      totalVentasBs: 1950 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    // TOTAL COBRADO sin cambios: 2699.99 (cash) + 650 (SAF) = 3349.99, SIN el CxC
    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(3349.99))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(3349.99 * TASA))).toBeInTheDocument()

    // TOTAL NETO SESION = 3349.99 + 400 (CxC pendiente) = 3749.99
    const totalNetoSesion = within(screen.getByTestId('total-neto-sesion'))
    expect(screen.getByText('TOTAL NETO SESIÓN')).toBeInTheDocument()
    expect(totalNetoSesion.getByText(formatUsd(3749.99))).toBeInTheDocument()
    expect(totalNetoSesion.getByText(formatBs(3749.99 * TASA))).toBeInTheDocument()
  })

  it('sin CxC pendiente (cxc=0): TOTAL NETO SESION == TOTAL COBRADO', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 500, totalOriginal: 500, totalBs: 500 * TASA },
      ],
      cxcTotalUsd: 0,
      totalVentasUsd: 500,
      totalVentasBs: 500 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(500))).toBeInTheDocument()

    const totalNetoSesion = within(screen.getByTestId('total-neto-sesion'))
    expect(totalNetoSesion.getByText(formatUsd(500))).toBeInTheDocument()
    expect(totalNetoSesion.getByText(formatBs(500 * TASA))).toBeInTheDocument()
  })

  it('posicion: la fila "A credito (CxC)" se renderiza ENTRE TOTAL COBRADO y TOTAL NETO SESION', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 100, totalOriginal: 100, totalBs: 100 * TASA },
      ],
      cxcTotalUsd: 400,
      cxcTotalBs: 400 * TASA,
      totalVentasUsd: 500,
      totalVentasBs: 500 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const totalCobradoEl = screen.getByTestId('total-cobrado')
    const cxcEl = screen.getByText('A credito (CxC)')
    const totalNetoSesionEl = screen.getByTestId('total-neto-sesion')

    // totalCobradoEl DEBE venir ANTES de cxcEl (DOCUMENT_POSITION_FOLLOWING = cxcEl sigue a totalCobradoEl)
    expect(totalCobradoEl.compareDocumentPosition(cxcEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // cxcEl DEBE venir ANTES de totalNetoSesionEl
    expect(cxcEl.compareDocumentPosition(totalNetoSesionEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// Reintegro NC (sesion) + Devolucion de Tesoreria (sdd/cuadre-saf-generado-consumido/
// nc-refund-right-card, engram #5369): cuando una NC se reembolsa, Card IZQUIERDA
// (Resumen de Caja) SIEMPRE resta la NC completa en su TOTAL NETO SESION, sin importar el
// origen del reembolso. Card DERECHA (esta card) antes NO mostraba el reembolso saliendo,
// por lo que su TOTAL NETO SESION quedaba mas alto que el de la izquierda. El fix agrega 2
// filas de resta, cada una gateada a > 0: "(-) Reintegro NC (sesion)" (reembolso en
// EFECTIVO de la sesion, reusa useMovimientosManualesDia + splitEgresosArqueo ->
// devolucionesNcUsd/BsNativo) y "(-) Devolucion de Tesoreria" (reembolso real desde
// banco/caja fuerte, useDevolucionTesoreriaNC — el dinero nunca salio de la sesion).
// Nueva formula: TOTAL NETO SESION = TOTAL COBRADO + CxC - reintegroSesion - devolucionTesoreria.
describe('PagosResumen — Reintegro NC (sesion) y Devolucion de Tesoreria restan en TOTAL NETO SESION (sdd/cuadre-saf-generado-consumido/nc-refund-right-card)', () => {
  it('ejemplo del owner (sesion): factura1 650 (TDD Banesco) + factura2 650 (Efectivo) = TOTAL COBRADO 1300; NC reembolsa 650 EN EFECTIVO DE LA SESION -> fila "Reintegro NC (sesion)" visible con 650; TOTAL NETO SESION = 1300 - 650 = 650 (== LEFT 650)', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'TDD Banesco', tipo: 'TARJETA', moneda: 'USD', totalUsd: 650, totalOriginal: 650, totalBs: 650 * TASA },
        { metodo_cobro_id: 'm2', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 650, totalOriginal: 650, totalBs: 650 * TASA },
      ],
      totalVentasUsd: 1300,
      totalVentasBs: 1300 * TASA,
      movimientosManuales: [
        { metodo_tipo: 'EFECTIVO', metodo_moneda: 'USD', mov_tipo: 'EGRESO', origen: 'NCR', total: 650 },
      ],
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    // TOTAL COBRADO permanece en 1300 (gross, SIN descontar el reintegro)
    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(1300))).toBeInTheDocument()

    expect(screen.getByText('(−) Reintegro NC (sesión)')).toBeInTheDocument()
    const reintegro = within(screen.getByTestId('reintegro-nc-sesion'))
    expect(reintegro.getByText(formatUsd(650))).toBeInTheDocument()

    expect(screen.queryByText('(−) Devolución de Tesorería')).not.toBeInTheDocument()

    const totalNetoSesion = within(screen.getByTestId('total-neto-sesion'))
    expect(totalNetoSesion.getByText(formatUsd(650))).toBeInTheDocument()
  })

  it('variante tesoreria: mismo escenario pero el reembolso de 650 sale de BANCO/CAJA FUERTE (nunca salio de la sesion) -> "Reintegro NC (sesion)" AUSENTE, "Devolucion de Tesoreria" visible con 650; TOTAL NETO SESION = 1300 - 650 = 650 (== LEFT 650)', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'TDD Banesco', tipo: 'TARJETA', moneda: 'USD', totalUsd: 650, totalOriginal: 650, totalBs: 650 * TASA },
        { metodo_cobro_id: 'm2', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 650, totalOriginal: 650, totalBs: 650 * TASA },
      ],
      totalVentasUsd: 1300,
      totalVentasBs: 1300 * TASA,
      devolucionTesoreriaUsd: 650,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(1300))).toBeInTheDocument()

    expect(screen.queryByText('(−) Reintegro NC (sesión)')).not.toBeInTheDocument()

    expect(screen.getByText('(−) Devolución de Tesorería')).toBeInTheDocument()
    const devolucionTesoreria = within(screen.getByTestId('devolucion-tesoreria'))
    expect(devolucionTesoreria.getByText(formatUsd(650))).toBeInTheDocument()

    const totalNetoSesion = within(screen.getByTestId('total-neto-sesion'))
    expect(totalNetoSesion.getByText(formatUsd(650))).toBeInTheDocument()
  })

  it('sin NC (ambos refunds en 0): ninguna de las 2 filas se renderiza y TOTAL NETO SESION no cambia (sin regresion)', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 500, totalOriginal: 500, totalBs: 500 * TASA },
      ],
      totalVentasUsd: 500,
      totalVentasBs: 500 * TASA,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    expect(screen.queryByTestId('reintegro-nc-sesion')).not.toBeInTheDocument()
    expect(screen.queryByTestId('devolucion-tesoreria')).not.toBeInTheDocument()

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(500))).toBeInTheDocument()

    const totalNetoSesion = within(screen.getByTestId('total-neto-sesion'))
    expect(totalNetoSesion.getByText(formatUsd(500))).toBeInTheDocument()
  })

  it('posicion: "Reintegro NC (sesion)" y "Devolucion de Tesoreria" se renderizan DESPUES de "A credito (CxC)" y ANTES de TOTAL NETO SESION', () => {
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'Efectivo USD', tipo: 'EFECTIVO', moneda: 'USD', totalUsd: 700, totalOriginal: 700, totalBs: 700 * TASA },
      ],
      cxcTotalUsd: 100,
      cxcTotalBs: 100 * TASA,
      totalVentasUsd: 800,
      totalVentasBs: 800 * TASA,
      movimientosManuales: [
        { metodo_tipo: 'EFECTIVO', metodo_moneda: 'USD', mov_tipo: 'EGRESO', origen: 'NCR', total: 50 },
      ],
      devolucionTesoreriaUsd: 30,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA} />)

    const cxcEl = screen.getByText('A credito (CxC)')
    const reintegroEl = screen.getByTestId('reintegro-nc-sesion')
    const devolucionEl = screen.getByTestId('devolucion-tesoreria')
    const totalNetoSesionEl = screen.getByTestId('total-neto-sesion')

    expect(cxcEl.compareDocumentPosition(reintegroEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(reintegroEl.compareDocumentPosition(devolucionEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(devolucionEl.compareDocumentPosition(totalNetoSesionEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // TOTAL COBRADO = 700 (cash, gross) -- totalVentasUsd NO alimenta totalCobrado en este
    // componente, solo cashBruto+saf+diferencial+absorcion.
    // TOTAL NETO SESION = 700 (cobrado) + 100 (cxc) - 50 (reintegro) - 30 (tesoreria) = 720
    const totalNetoSesion = within(totalNetoSesionEl)
    expect(totalNetoSesion.getByText(formatUsd(720))).toBeInTheDocument()
  })
})

// REGRESION (fix/cuadre-reintegro-nc-moneda, engram #5372): splitEgresosArqueo /
// useDevolucionTesoreriaNC clasifican el reembolso en 2 BUCKETS MUTUAMENTE EXCLUYENTES
// (USD vs Bs) segun la MONEDA del metodo/cuenta usada para reembolsar — NO es una
// conversion. Cuando el reembolso es 100% en Bs (ej EFECTIVO BS), el bucket USD queda
// estructuralmente en 0 mientras el bucket Bs trae el monto real. Esto rompia 2 cosas:
//   1) el gate de render de la fila (chequeaba SOLO el bucket USD -> fila oculta)
//   2) netoSesionUsd (resta SOLO el bucket USD) quedaba sin bajar mientras netoSesionBs SI
//      bajaba -> las 2 columnas de TOTAL NETO SESION dejaban de ser consistentes entre si.
// El fix deriva el equivalente de la moneda faltante via tasaDelDia (mismo patron que
// `safBs`/`diferencialNetoUsdCalc` en este archivo), para que AMBAS columnas bajen de forma
// consistente y la fila se muestre sin importar en que moneda se resolvio el reembolso.
describe('PagosResumen — reembolso NC/tesoreria en Bs nativo: fila visible + columnas USD/Bs consistentes (fix/cuadre-reintegro-nc-moneda, #5372)', () => {
  it('Reintegro NC (sesion) pagado en EFECTIVO BS (metodo_moneda=BS): la fila RENDERIZA y netoSesion resta de forma CONSISTENTE en USD y Bs (USD = Bs / tasa)', () => {
    const TASA_BS = 500
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'TDD Banesco', tipo: 'TARJETA', moneda: 'BS', totalUsd: 1.3, totalOriginal: 650, totalBs: 650 },
        { metodo_cobro_id: 'm2', nombre: 'Efectivo BS', tipo: 'EFECTIVO', moneda: 'BS', totalUsd: 1.3, totalOriginal: 650, totalBs: 650 },
      ],
      totalVentasUsd: 2.6,
      totalVentasBs: 1300,
      movimientosManuales: [
        { metodo_tipo: 'EFECTIVO', metodo_moneda: 'BS', mov_tipo: 'EGRESO', origen: 'NCR', total: 650 },
      ],
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA_BS} />)

    // TOTAL COBRADO = 1300 Bs / $2.60 (gross, sin descontar el reintegro)
    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(2.6))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(1300))).toBeInTheDocument()

    // La fila DEBE renderizar aunque el bucket nativo USD de splitEgresosArqueo sea 0 —
    // el gate debe mirar TAMBIEN el bucket Bs nativo (reintegroSesionBsNativo).
    expect(screen.getByText('(−) Reintegro NC (sesión)')).toBeInTheDocument()
    const reintegro = within(screen.getByTestId('reintegro-nc-sesion'))
    // Bs nativo (real, sin conversion): 650
    expect(reintegro.getByText(formatBs(650))).toBeInTheDocument()
    // USD equivalente derivado via tasa (antes: $0.00 estructural) = 650 / 500 = 1.30
    expect(reintegro.getByText(formatUsd(1.3))).toBeInTheDocument()

    // netoSesionBs = 1300 - 650 = 650 Y netoSesionUsd = 2.60 - 1.30 = 1.30 -- AMBAS
    // columnas deben reflejar la resta (antes: USD se quedaba pegado en 2.60, inconsistente
    // con el Bs que SI bajaba a 650).
    const totalNetoSesion = within(screen.getByTestId('total-neto-sesion'))
    expect(totalNetoSesion.getByText(formatBs(650))).toBeInTheDocument()
    expect(totalNetoSesion.getByText(formatUsd(1.3))).toBeInTheDocument()
  })

  it('Devolucion de Tesoreria resuelta desde banco/caja fuerte en Bs (devolucionTesoreriaBs>0, devolucionTesoreriaUsd=0): la fila RENDERIZA y netoSesion resta de forma CONSISTENTE en USD y Bs', () => {
    const TASA_BS = 500
    setup({
      metodos: [
        { metodo_cobro_id: 'm1', nombre: 'TDD Banesco', tipo: 'TARJETA', moneda: 'BS', totalUsd: 1.3, totalOriginal: 650, totalBs: 650 },
        { metodo_cobro_id: 'm2', nombre: 'Efectivo BS', tipo: 'EFECTIVO', moneda: 'BS', totalUsd: 1.3, totalOriginal: 650, totalBs: 650 },
      ],
      totalVentasUsd: 2.6,
      totalVentasBs: 1300,
      devolucionTesoreriaBs: 650,
    })

    render(<PagosResumen filters={filters} tasaDelDia={TASA_BS} />)

    const totalCobrado = within(screen.getByTestId('total-cobrado'))
    expect(totalCobrado.getByText(formatUsd(2.6))).toBeInTheDocument()
    expect(totalCobrado.getByText(formatBs(1300))).toBeInTheDocument()

    // La fila DEBE renderizar aunque devolucionTesoreriaUsd (bucket nativo USD) sea 0 — el
    // gate debe mirar TAMBIEN devolucionTesoreriaBs.
    expect(screen.getByText('(−) Devolución de Tesorería')).toBeInTheDocument()
    const devolucion = within(screen.getByTestId('devolucion-tesoreria'))
    expect(devolucion.getByText(formatBs(650))).toBeInTheDocument()
    expect(devolucion.getByText(formatUsd(1.3))).toBeInTheDocument()

    const totalNetoSesion = within(screen.getByTestId('total-neto-sesion'))
    expect(totalNetoSesion.getByText(formatBs(650))).toBeInTheDocument()
    expect(totalNetoSesion.getByText(formatUsd(1.3))).toBeInTheDocument()
  })
})
