// CuadreTotalesFiscales (Card 1 "Resumen Fiscal") — grilla UNIFICADA y
// alineada por concepto: cada fila fiscal (Subtotal, Exento, Base+IVA por
// alicuota, Total) muestra el valor de Ventas y el valor de Devoluciones (NC)
// EN LA MISMA fila, en vez de dos listas independientes que podian
// desalinearse cuando las alicuotas de cada lado no coincidian. La logica de
// union/orden/celdas-vacias vive en la funcion pura `buildFilasAlineadas`
// (ver cuadre-totales-fiscales-model.test.ts) — este archivo prueba el
// WIRING: que el componente arma el input correcto para esa funcion y pinta
// el resultado (labels, valores Ventas SIN cambios, celdas vacias con "—").
// Ver engram sdd/nc-cuadre/card1-diseno. Mock pattern: mockea los 3 hooks de
// '../../hooks/use-cuadre' directamente (mismo patron que antes).
vi.mock('../../hooks/use-cuadre', () => ({
  useTotalesFiscales: vi.fn(),
  useIvaPorAlicuota: vi.fn(),
  useIvaPorAlicuotaNC: vi.fn(),
}))

// `useMobile` se mockea SOLO en el describe "layout mobile" de abajo — el
// resto de los tests de este archivo no lo mockean, por lo que corren con el
// valor real del hook (isMobile=false en happy-dom, default innerWidth=1024),
// preservando 100% el comportamiento/aserciones del layout DESKTOP.
vi.mock('@/hooks/use-mobile', () => ({
  useMobile: vi.fn(() => false),
}))

import { render, screen, within } from '@testing-library/react'
import { CuadreTotalesFiscales } from '../cuadre-totales-fiscales'
import { useTotalesFiscales, useIvaPorAlicuota, useIvaPorAlicuotaNC } from '../../hooks/use-cuadre'
import { useMobile } from '@/hooks/use-mobile'

const mockedUseTotalesFiscales = vi.mocked(useTotalesFiscales)
const mockedUseIvaPorAlicuota = vi.mocked(useIvaPorAlicuota)
const mockedUseIvaPorAlicuotaNC = vi.mocked(useIvaPorAlicuotaNC)
const mockedUseMobile = vi.mocked(useMobile)

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
  totalNcrBaseUsd?: number
  totalNcrBaseBs?: number
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
    totalNcrBaseUsd: opts.totalNcrBaseUsd ?? 0,
    totalNcrBaseBs: opts.totalNcrBaseBs ?? 0,
    totalNcrTotalUsd: opts.totalNcrTotalUsd ?? 0,
    totalNcrTotalBs: opts.totalNcrTotalBs ?? 0,
    isLoading: false,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CuadreTotalesFiscales — grilla unificada por concepto (nc-cuadre-sesion, Card 1)', () => {
  it('renderiza una fila Base+IVA por CADA alicuota de NC presente (16% y 8% simultaneas), alineada con Ventas', () => {
    setup({
      alicuotasVentas: [
        { impuestoPct: 16, baseUsd: 150, baseBs: 6300, montoIvaUsd: 24, montoIvaBs: 1008 },
        { impuestoPct: 8, baseUsd: 50, baseBs: 2100, montoIvaUsd: 4, montoIvaBs: 168 },
      ],
      alicuotasNc: [
        { impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 },
        { impuestoPct: 8, baseUsd: 20, baseBs: 840, montoIvaUsd: 1.6, montoIvaBs: 67.2 },
      ],
      totalNcrTotalUsd: 137.6,
      totalNcrTotalBs: 5779.2,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    expect(screen.getAllByText('Base imponible 16%', { exact: false })).toHaveLength(2)
    expect(screen.getAllByText('IVA 16%', { exact: false })).toHaveLength(2)
    expect(screen.getAllByText('Base imponible 8%', { exact: false })).toHaveLength(2)
    expect(screen.getAllByText('IVA 8%', { exact: false })).toHaveLength(2)
  })

  it('triangulacion: solo alicuota 8% en NC (Ventas tiene 16% y 8%) — la fila 16% deja la celda NC vacia ("—")', () => {
    setup({
      alicuotasVentas: [
        { impuestoPct: 16, baseUsd: 150, baseBs: 6300, montoIvaUsd: 24, montoIvaBs: 1008 },
        { impuestoPct: 8, baseUsd: 50, baseBs: 2100, montoIvaUsd: 4, montoIvaBs: 168 },
      ],
      alicuotasNc: [{ impuestoPct: 8, baseUsd: 20, baseBs: 840, montoIvaUsd: 1.6, montoIvaBs: 67.2 }],
      totalNcrTotalUsd: 21.6,
      totalNcrTotalBs: 907.2,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    // Fila "Base imponible 16%" existe una sola vez (solo del lado Ventas) —
    // la celda de Devoluciones para esa fila es un "—", no un segundo label.
    expect(screen.getAllByText('Base imponible 16%', { exact: false })).toHaveLength(1)
    expect(screen.getAllByText('Base imponible 8%', { exact: false })).toHaveLength(2)
  })

  it('fila Exento: NO aparece cuando NINGUN lado tiene monto exento > 0', () => {
    setup({
      totales: { totalExentoUsd: 0 },
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrExentoUsd: 0,
      totalNcrTotalUsd: 116,
      totalNcrTotalBs: 4872,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    expect(screen.queryByText('Exento', { exact: true })).not.toBeInTheDocument()
  })

  it('fila Exento aparece cuando SOLO Devoluciones tiene exento > 0 — celda Ventas queda vacia ("—")', () => {
    setup({
      totales: { totalExentoUsd: 0 },
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrExentoUsd: 50,
      totalNcrExentoBs: 2100,
      totalNcrTotalUsd: 166,
      totalNcrTotalBs: 6972,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    // Solo una fila "Exento" (una sola aparicion del label) porque el lado
    // Ventas esta vacio para ese concepto.
    expect(screen.getAllByText('Exento', { exact: true })).toHaveLength(1)
  })

  it('Subtotal (antes de impuestos): Devoluciones = base NC + exento NC (nuevo campo totalNcrBaseUsd)', () => {
    setup({
      totales: { totalExentoUsd: 0, baseImponibleUsd: 200, baseImponibleBs: 8400, totalDescuentoUsd: 0 },
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrExentoUsd: 30, totalNcrExentoBs: 1260,
      totalNcrBaseUsd: 100, totalNcrBaseBs: 4200,
      totalNcrTotalUsd: 146, totalNcrTotalBs: 6132,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    const subtotalLabels = screen.getAllByText('Subtotal (antes de impuestos)', { exact: false })
    expect(subtotalLabels).toHaveLength(2)
    // Fila Devoluciones del subtotal = 100 (base NC) + 30 (exento NC) = 130
    const ncSubtotalRow = subtotalLabels[1].closest('div')
    expect(within(ncSubtotalRow as HTMLElement).getByText('$130.00', { exact: false })).toBeInTheDocument()
  })

  it('TOTAL FACTURADO NETO = Ventas (totalVentasUsd) - Devoluciones (totalNcrTotalUsd), formateado en USD y Bs', () => {
    setup({
      totales: { totalVentasUsd: 232, totalVentasBs: 9744 },
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 27.586, baseBs: 1158.6, montoIvaUsd: 4.414, montoIvaBs: 185.4 }],
      totalNcrTotalUsd: 32,
      totalNcrTotalBs: 1344,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    const netoLabel = screen.getByText('TOTAL FACTURADO NETO', { exact: false })
    const netoRow = netoLabel.parentElement as HTMLElement
    expect(within(netoRow).getByText('$200.00', { exact: false })).toBeInTheDocument()
    expect(within(netoRow).getByText(/Bs\.\s*8\.400,00/)).toBeInTheDocument()
  })

  it('el campo Ventas "Total facturado" (totalVentasUsd) NO cambia por el bloque de NC — cero ripple en el calculo', () => {
    setup({
      totales: { totalVentasUsd: 232, totalVentasBs: 9744 },
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrTotalUsd: 116,
      totalNcrTotalBs: 4872,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    expect(screen.getByText('Total facturado', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('$232.00', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Total Notas de Crédito', { exact: true })).toBeInTheDocument()
  })

  it('fila total: Devoluciones queda vacia ("—", sin label "Total Notas de Credito") cuando NO hay devoluciones en la sesion', () => {
    setup({
      totales: { totalVentasUsd: 232, totalVentasBs: 9744 },
      alicuotasNc: [],
      totalNcrTotalUsd: 0,
      totalNcrTotalBs: 0,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    expect(screen.getByText('Total facturado', { exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Total Notas de Crédito', { exact: true })).not.toBeInTheDocument()
  })

  it('orden en el DOM: Subtotal -> Exento -> alicuotas ascendente -> Total (grilla unica, no dos columnas independientes)', () => {
    setup({
      totales: { totalExentoUsd: 40, totalExentoBs: 1680 },
      alicuotasVentas: [
        { impuestoPct: 16, baseUsd: 150, baseBs: 6300, montoIvaUsd: 24, montoIvaBs: 1008 },
        { impuestoPct: 8, baseUsd: 50, baseBs: 2100, montoIvaUsd: 4, montoIvaBs: 168 },
      ],
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrTotalUsd: 116,
      totalNcrTotalBs: 4872,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    const text = document.body.textContent ?? ''
    const idxSubtotal = text.indexOf('Subtotal (antes de impuestos)')
    const idxExento = text.indexOf('Exento')
    const idxBase8 = text.indexOf('Base imponible 8%')
    const idxBase16 = text.indexOf('Base imponible 16%')
    const idxTotal = text.indexOf('Total facturado')
    const idxNeto = text.indexOf('TOTAL FACTURADO NETO')

    expect(idxSubtotal).toBeGreaterThan(-1)
    expect(idxExento).toBeGreaterThan(idxSubtotal)
    expect(idxBase8).toBeGreaterThan(idxExento)
    expect(idxBase16).toBeGreaterThan(idxBase8)
    expect(idxTotal).toBeGreaterThan(idxBase16)
    expect(idxNeto).toBeGreaterThan(idxTotal)
  })
})

// ── Layout MOBILE (isMobile=true) ──────────────────────────────────────
// El bug reportado: en mobile, la grilla alineada por concepto colapsaba a
// 1 columna pero seguia intercalando Ventas/NC concepto-a-concepto (Subtotal
// ventas, Subtotal NC, Exento ventas, — NC, ...), confuso para el usuario.
// El fix: en mobile se renderizan DOS BLOQUES completos apilados (Ventas
// entero, luego Devoluciones entero con SOLO sus propios conceptos reales,
// sin placeholders "—" — esos son exclusivos de la grilla alineada de
// desktop), y el Neto full-width al final. Ver engram sdd/nc-cuadre/apply-progress.
describe('CuadreTotalesFiscales — layout MOBILE: bloques completos apilados (no interleaved por concepto)', () => {
  beforeEach(() => {
    mockedUseMobile.mockReturnValue(true)
  })

  it('apila el bloque Ventas COMPLETO y luego Devoluciones con SOLO sus propios conceptos (sin fila Exento ni "—" cuando NC no tiene exento)', () => {
    setup({
      totales: { totalExentoUsd: 40, totalExentoBs: 1680 }, // Ventas SI tiene exento
      alicuotasVentas: [{ impuestoPct: 16, baseUsd: 150, baseBs: 6300, montoIvaUsd: 24, montoIvaBs: 1008 }],
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 }],
      totalNcrExentoUsd: 0, // NC NO tiene exento
      totalNcrTotalUsd: 116,
      totalNcrTotalBs: 4872,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    const ventasBlock = screen.getByRole('group', { name: 'Ventas' })
    const ncBlock = screen.getByRole('group', { name: 'Notas de Crédito (Devoluciones)' })

    // Ventas SI muestra su propia fila Exento (bloque autonomo)
    expect(within(ventasBlock).getByText('Exento', { exact: true })).toBeInTheDocument()
    // NC NO tiene exento -> no aparece la fila NI un placeholder "—" (eso es solo de desktop)
    expect(within(ncBlock).queryByText('Exento', { exact: true })).not.toBeInTheDocument()
    expect(within(ncBlock).queryByText('—')).not.toBeInTheDocument()

    // Cada bloque trae su propio Subtotal y su propio Total (concepto completo)
    expect(within(ventasBlock).getByText('Subtotal (antes de impuestos)', { exact: false })).toBeInTheDocument()
    expect(within(ventasBlock).getByText('Total facturado', { exact: true })).toBeInTheDocument()
    expect(within(ncBlock).getByText('Subtotal (antes de impuestos)', { exact: false })).toBeInTheDocument()
    expect(within(ncBlock).getByText('Total Notas de Crédito', { exact: true })).toBeInTheDocument()

    // El bloque Ventas aparece COMPLETO antes de que empiece el bloque NC (no interleaved)
    const text = document.body.textContent ?? ''
    expect(text.indexOf('Total facturado')).toBeLessThan(text.indexOf('Notas de Crédito (Devoluciones)'))
  })

  it('triangulacion: sin devoluciones en la sesion, el bloque NC no se renderiza (solo Ventas + Neto)', () => {
    setup({
      alicuotasNc: [],
      totalNcrTotalUsd: 0,
      totalNcrTotalBs: 0,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    expect(screen.getByRole('group', { name: 'Ventas' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Notas de Crédito (Devoluciones)' })).not.toBeInTheDocument()
    expect(screen.getByText('TOTAL FACTURADO NETO')).toBeInTheDocument()
  })

  it('triangulacion: el bloque NC lista TODAS sus propias alicuotas (16% y 8%) sin depender de las alicuotas de Ventas', () => {
    setup({
      alicuotasVentas: [{ impuestoPct: 16, baseUsd: 150, baseBs: 6300, montoIvaUsd: 24, montoIvaBs: 1008 }],
      alicuotasNc: [
        { impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672 },
        { impuestoPct: 8, baseUsd: 20, baseBs: 840, montoIvaUsd: 1.6, montoIvaBs: 67.2 },
      ],
      totalNcrTotalUsd: 137.6,
      totalNcrTotalBs: 5779.2,
    })

    render(<CuadreTotalesFiscales filters={filters} />)

    const ncBlock = screen.getByRole('group', { name: 'Notas de Crédito (Devoluciones)' })
    expect(within(ncBlock).getByText('Base imponible 16%', { exact: false })).toBeInTheDocument()
    expect(within(ncBlock).getByText('IVA 16%', { exact: false })).toBeInTheDocument()
    expect(within(ncBlock).getByText('Base imponible 8%', { exact: false })).toBeInTheDocument()
    expect(within(ncBlock).getByText('IVA 8%', { exact: false })).toBeInTheDocument()
  })
})
