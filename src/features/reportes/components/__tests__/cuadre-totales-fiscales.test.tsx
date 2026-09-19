// CuadreTotalesFiscales (Card 1 "Resumen Fiscal") — bloque nuevo "Notas de
// Credito (Devoluciones)" espejo dinamico del bloque de Ventas (una fila
// Base+IVA por alicuota real presente + Exento condicional), mas fila
// full-width "TOTAL FACTURADO NETO" = Ventas - Devoluciones. Ver engram
// sdd/nc-cuadre/card1-diseno. Mock pattern: mockea los 3 hooks de
// '../../hooks/use-cuadre' directamente (mismo patron que
// ventas-consultas-modal.test.tsx para componentes de reportes).
vi.mock('../../hooks/use-cuadre', () => ({
  useTotalesFiscales: vi.fn(),
  useIvaPorAlicuota: vi.fn(),
  useIvaPorAlicuotaNC: vi.fn(),
}))

import { render, screen, within } from '@testing-library/react'
import { CuadreTotalesFiscales } from '../cuadre-totales-fiscales'
import { useTotalesFiscales, useIvaPorAlicuota, useIvaPorAlicuotaNC } from '../../hooks/use-cuadre'

const mockedUseTotalesFiscales = vi.mocked(useTotalesFiscales)
const mockedUseIvaPorAlicuota = vi.mocked(useIvaPorAlicuota)
const mockedUseIvaPorAlicuotaNC = vi.mocked(useIvaPorAlicuotaNC)

const filters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }

function totalesFixture(overrides: Partial<Record<string, number>> = {}) {
  return {
    baseImponibleUsd: 200, baseImponibleBs: 8400,
    totalExentoUsd: 0, totalExentoBs: 0,
    totalIvaUsd: 32, totalIvaBs: 1344,
    totalIgtfUsd: 0, totalIgtfBs: 0,
    totalFacturadoUsd: 232, totalFacturadoBs: 9744,
    totalDescuentoUsd: 0, totalDescuentoBs: 0,
    totalNcrUsd: 0, totalNcrBs: 0,
    totalVentasUsd: 232, totalVentasBs: 9744,
    totalFinancieroUsd: 0, totalFinancieroBs: 0,
    ...overrides,
  }
}

function setup(opts: {
  totales?: Partial<Record<string, number>>
  alicuotasVentas?: Array<{ impuestoPct: number; baseUsd: number; baseBs: number; montoIvaUsd: number; montoIvaBs: number }>
  alicuotasNc?: Array<{ impuestoPct: number; baseUsd: number; baseBs: number; montoIvaUsd: number; montoIvaBs: number }>
  totalNcrExentoUsd?: number
  totalNcrExentoBs?: number
  totalNcrTotalUsd?: number
  totalNcrTotalBs?: number
}) {
  mockedUseTotalesFiscales.mockReturnValue({
    totales: totalesFixture(opts.totales) as never,
    isLoading: false,
  })
  mockedUseIvaPorAlicuota.mockReturnValue({
    alicuotas: opts.alicuotasVentas ?? [{ impuestoPct: 16, baseUsd: 150, baseBs: 6300, montoIvaUsd: 24, montoIvaBs: 1008 }],
    isLoading: false,
  })
  mockedUseIvaPorAlicuotaNC.mockReturnValue({
    alicuotas: opts.alicuotasNc ?? [],
    totalNcrExentoUsd: opts.totalNcrExentoUsd ?? 0,
    totalNcrExentoBs: opts.totalNcrExentoBs ?? 0,
    totalNcrTotalUsd: opts.totalNcrTotalUsd ?? 0,
    totalNcrTotalBs: opts.totalNcrTotalBs ?? 0,
    isLoading: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

/** Scopes queries to the Devoluciones (NC) column — avoids collisions with
 * identical labels (e.g. "Base imponible 16%") that can also appear in the
 * Ventas column when both share an aliquot. */
function getDevolucionesColumn(): HTMLElement {
  const heading = screen.getByText('Notas de Crédito (Devoluciones)')
  return heading.parentElement as HTMLElement
}

describe('CuadreTotalesFiscales — bloque Devoluciones (nc-cuadre-sesion, Card 1)', () => {
  it('renderiza una fila Base+IVA por CADA alicuota de NC presente (16% y 8% simultaneas)', () => {
    setup({
      alicuotasNc: [
        { impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 },
        { impuestoPct: 8, baseUsd: 20, baseBs: 840, montoIvaUsd: 1.6, montoIvaBs: 67.2 },
      ],
      totalNcrTotalUsd: 137.6,
      totalNcrTotalBs: 5779.2,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    const col = getDevolucionesColumn()
    expect(within(col).getByText('Base imponible 16%', { exact: false })).toBeInTheDocument()
    expect(within(col).getByText('IVA 16%', { exact: false })).toBeInTheDocument()
    expect(within(col).getByText('Base imponible 8%', { exact: false })).toBeInTheDocument()
    expect(within(col).getByText('IVA 8%', { exact: false })).toBeInTheDocument()
  })

  it('triangulacion: solo alicuota 8% en NC (sin 16%) — prueba group-by dinamico real, no hardcodeado', () => {
    setup({
      alicuotasNc: [{ impuestoPct: 8, baseUsd: 20, baseBs: 840, montoIvaUsd: 1.6, montoIvaBs: 67.2 }],
      totalNcrTotalUsd: 21.6,
      totalNcrTotalBs: 907.2,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    const col = getDevolucionesColumn()
    expect(within(col).getByText('Base imponible 8%', { exact: false })).toBeInTheDocument()
    expect(within(col).queryByText('Base imponible 16%', { exact: false })).not.toBeInTheDocument()
  })

  it('fila Exento de NC es condicional: NO aparece cuando totalNcrExentoUsd es 0', () => {
    setup({
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrExentoUsd: 0,
      totalNcrTotalUsd: 116,
      totalNcrTotalBs: 4872,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    // La unica fila "Exento" visible debe ser la de Ventas (totalExentoUsd=0 en
    // este fixture tambien, asi que no deberia haber NINGUNA fila Exento)
    expect(screen.queryByText('Exento', { exact: true })).not.toBeInTheDocument()
  })

  it('fila Exento de NC aparece cuando totalNcrExentoUsd > 0', () => {
    setup({
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrExentoUsd: 50,
      totalNcrExentoBs: 2100,
      totalNcrTotalUsd: 166,
      totalNcrTotalBs: 6972,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    expect(screen.getByText('Exento', { exact: true })).toBeInTheDocument()
  })

  it('TOTAL FACTURADO NETO = Ventas (totalVentasUsd) - Devoluciones (totalNcrTotalUsd), formateado en USD y Bs', () => {
    setup({
      totales: { totalVentasUsd: 232, totalVentasBs: 9744 },
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 27.586, baseBs: 1158.6, montoIvaUsd: 4.414, montoIvaBs: 185.4 }],
      totalNcrTotalUsd: 32,
      totalNcrTotalBs: 1344,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    // Scope a la fila del Neto (por label) para no chocar con otros $ iguales
    // en la columna Ventas — evita falsos positivos por coincidencia numerica.
    const netoLabel = screen.getByText('TOTAL FACTURADO NETO', { exact: false })
    const netoRow = netoLabel.parentElement as HTMLElement
    // Neto USD = 232 - 32 = 200 -> $200.00; Neto Bs = 9744 - 1344 = 8400 -> Bs. 8.400,00
    expect(within(netoRow).getByText('$200.00', { exact: false })).toBeInTheDocument()
    expect(within(netoRow).getByText(/Bs\.\s*8\.400,00/)).toBeInTheDocument()
  })

  it('el campo Ventas "Total facturado" (totalVentasUsd) NO cambia por agregar el bloque de NC — cero ripple', () => {
    setup({
      totales: { totalVentasUsd: 232, totalVentasBs: 9744 },
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrTotalUsd: 116,
      totalNcrTotalBs: 4872,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    // "Total facturado" (fila Ventas, destacada) sigue mostrando el valor CRUDO
    // de totalVentasUsd/Bs sin restar NC — el neteo solo ocurre en la fila NETO.
    expect(screen.getByText('Total facturado', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('$232.00', { exact: false })).toBeInTheDocument()
  })

  it('orden en el DOM: Ventas -> Devoluciones -> Neto (apilado, sin depender de clases CSS)', () => {
    setup({
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrTotalUsd: 116,
      totalNcrTotalBs: 4872,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    const text = document.body.textContent ?? ''
    const idxVentasTotal = text.indexOf('Total facturado')
    const idxDevoluciones = text.indexOf('Notas de Crédito (Devoluciones)')
    const idxNeto = text.indexOf('TOTAL FACTURADO NETO')

    expect(idxVentasTotal).toBeGreaterThan(-1)
    expect(idxDevoluciones).toBeGreaterThan(idxVentasTotal)
    expect(idxNeto).toBeGreaterThan(idxDevoluciones)
  })
})
