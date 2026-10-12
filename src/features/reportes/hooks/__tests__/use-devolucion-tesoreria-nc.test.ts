// `useDevolucionTesoreriaNC` (use-cuadre.ts) — nueva fila "(−) Devolucion de Tesoreria" en
// Card derecha (Cobros por Metodo de Pago, pagos-resumen.tsx). Suma los egresos REALES de
// tesoreria (banco o caja fuerte) que reembolsaron NC(s) via modalidad
// REFUND_TESORERIA->TESORERIA (dinero que NUNCA salio de la sesion de caja — a diferencia
// del reintegro en efectivo via movimientos_metodo_cobro origen='NCR', que SI sale de la
// sesion y ya se deriva con splitEgresosArqueo + useMovimientosManualesDia).
// Mirror de `useReembolsosTesoreriaFactura` (use-notas-credito.ts, escopeado por venta_id)
// pero escopeado POR SESION via buildCuadreWhere(filters, empresaId, 'nc') — igual patron
// que useIvaPorAlicuotaNC. Ver engram #5369 (sdd/cuadre-saf-generado-consumido/nc-refund-right-card).
// Mock pattern mirrors use-iva-por-alicuota-nc.test.ts (useQuery + useCurrentUser mocked
// directamente, dispatch por texto de SQL).
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useDevolucionTesoreriaNC, type CuadreFilters } from '../use-cuadre'

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

function setup(opts: {
  bancosRow?: Record<string, unknown>
  cajasRow?: Record<string, unknown>
}) {
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', empresa_id: 'emp-1', email: '', nombre: '', level: 1, rol_id: null, rol_nombre: null },
    loading: false,
  })
  mockedUseQuery.mockImplementation(((sql: string) => {
    if (sql.includes('FROM movimientos_bancarios')) {
      return { data: opts.bancosRow ? [opts.bancosRow] : [], isLoading: false }
    }
    if (sql.includes('FROM mov_caja_fuerte')) {
      return { data: opts.cajasRow ? [opts.cajasRow] : [], isLoading: false }
    }
    return { data: [], isLoading: false }
  }) as unknown as typeof useQuery)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDevolucionTesoreriaNC — Card derecha, fila "(-) Devolucion de Tesoreria" (sdd/cuadre-saf-generado-consumido/nc-refund-right-card)', () => {
  it('suma un reembolso de BANCO en USD (moneda != VES) -> totalUsd > 0, totalBs == 0', () => {
    const filters: CuadreFilters = { fecha: '2026-10-12', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({ bancosRow: { total_usd: 650, total_bs: 0 } })

    const { result } = renderHook(() => useDevolucionTesoreriaNC(filters))

    expect(result.current.totalUsd).toBe(650)
    expect(result.current.totalBs).toBe(0)
  })

  it('triangulacion: reembolso de CAJA FUERTE en Bs nativo (moneda == VES) -> totalBs > 0, totalUsd == 0 (prueba que no esta hardcodeado a bancos/USD)', () => {
    const filters: CuadreFilters = { fecha: '2026-10-12', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({ cajasRow: { total_usd: 0, total_bs: 27300 } })

    const { result } = renderHook(() => useDevolucionTesoreriaNC(filters))

    expect(result.current.totalUsd).toBe(0)
    expect(result.current.totalBs).toBe(27300)
  })

  it('combina banco + caja fuerte: suma AMBAS fuentes en el mismo total (no solo una de las dos)', () => {
    const filters: CuadreFilters = { fecha: '2026-10-12', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({
      bancosRow: { total_usd: 400, total_bs: 0 },
      cajasRow: { total_usd: 250, total_bs: 0 },
    })

    const { result } = renderHook(() => useDevolucionTesoreriaNC(filters))

    expect(result.current.totalUsd).toBe(650)
  })

  it('filtra POR SESION (sesion_caja_id IN) en ambas queries, NO por fecha, y filtra empresa_id DIRECTO en movimientos_bancarios/mov_caja_fuerte (regla #11)', () => {
    const filters: CuadreFilters = { fecha: '2026-10-12', cajaId: 'caja-1', sesionCajaIds: ['sesion-1', 'sesion-2'] }
    setup({ bancosRow: { total_usd: 0, total_bs: 0 }, cajasRow: { total_usd: 0, total_bs: 0 } })

    renderHook(() => useDevolucionTesoreriaNC(filters))

    const bancosCall = mockedUseQuery.mock.calls.find(([sql]) => (sql as string).includes('FROM movimientos_bancarios'))
    const cajasCall = mockedUseQuery.mock.calls.find(([sql]) => (sql as string).includes('FROM mov_caja_fuerte'))

    expect(bancosCall?.[0]).toContain("origen = 'REEMBOLSO_NCR'")
    expect(bancosCall?.[0]).toContain('sesion_caja_id IN')
    expect(bancosCall?.[0]).not.toContain('DATE(')
    expect(bancosCall?.[1]).toEqual(['emp-1', 'emp-1', 'sesion-1', 'sesion-2'])

    expect(cajasCall?.[0]).toContain("origen = 'REEMBOLSO_NCR'")
    expect(cajasCall?.[0]).toContain('sesion_caja_id IN')
    expect(cajasCall?.[1]).toEqual(['emp-1', 'emp-1', 'sesion-1', 'sesion-2'])
  })

  it('sin reembolsos de tesoreria (filas en 0): totalUsd y totalBs son 0 (no inventa dinero)', () => {
    const filters: CuadreFilters = { fecha: '2026-10-12', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({ bancosRow: { total_usd: 0, total_bs: 0 }, cajasRow: { total_usd: 0, total_bs: 0 } })

    const { result } = renderHook(() => useDevolucionTesoreriaNC(filters))

    expect(result.current.totalUsd).toBe(0)
    expect(result.current.totalBs).toBe(0)
  })
})
