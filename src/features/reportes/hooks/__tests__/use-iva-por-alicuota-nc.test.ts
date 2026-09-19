// `useIvaPorAlicuotaNC` (use-cuadre.ts) — Card 1 "Resumen Fiscal", bloque
// "Notas de Credito (Devoluciones)". Espejo estructural de `useIvaPorAlicuota`
// (que ya agrupa dinamicamente por alicuota real, ver engram
// sdd/nc-cuadre/card1-aliquotas-dinamicas) pero sobre notas_credito_det JOIN
// notas_credito, escopeado POR SESION via buildCuadreWhere(filters, empresaId, 'nc')
// (NO por fecha como el viejo totalNcr de useTotalesFiscales). Montos siempre
// a la tasa HISTORICA de cada NC (subtotal_bs/total_bs ya persistidos en creacion,
// nunca recalculados con una tasa "actual").
// Mock pattern mirrors use-facturas-sesion-activa.test.ts / use-saf-diario.test.ts
// (useQuery + useCurrentUser mocked directamente, dispatch por texto de SQL).
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useIvaPorAlicuotaNC, type CuadreFilters } from '../use-cuadre'

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

function setup(opts: {
  alicuotas?: Array<Record<string, unknown>>
  header?: Record<string, unknown>
}) {
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', empresa_id: 'emp-1', email: '', nombre: '', level: 1, rol_id: null, rol_nombre: null },
    loading: false,
  })
  mockedUseQuery.mockImplementation(((sql: string) => {
    if (sql.includes('FROM notas_credito_det')) {
      return { data: opts.alicuotas ?? [], isLoading: false }
    }
    if (sql.includes('FROM notas_credito')) {
      return { data: opts.header ? [opts.header] : [], isLoading: false }
    }
    return { data: [], isLoading: false }
  }) as unknown as typeof useQuery)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useIvaPorAlicuotaNC — Card 1 Resumen Fiscal, bloque Devoluciones (nc-cuadre-sesion)', () => {
  it('agrupa por alicuota real (16% y 8% simultaneas) — group-by dinamico sobre notas_credito_det', () => {
    const filters: CuadreFilters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({
      alicuotas: [
        { impuesto_pct: 16, base_usd: 100, base_bs: 4200, monto_iva: 16, monto_iva_bs: 672 },
        { impuesto_pct: 8, base_usd: 50, base_bs: 2100, monto_iva: 4, monto_iva_bs: 168 },
      ],
    })

    const { result } = renderHook(() => useIvaPorAlicuotaNC(filters))

    expect(result.current.alicuotas).toHaveLength(2)
    expect(result.current.alicuotas).toContainEqual({
      impuestoPct: 16, baseUsd: 100, baseBs: 4200, montoIvaUsd: 16, montoIvaBs: 672,
    })
    expect(result.current.alicuotas).toContainEqual({
      impuestoPct: 8, baseUsd: 50, baseBs: 2100, montoIvaUsd: 4, montoIvaBs: 168,
    })
  })

  it('triangulacion: solo 8% presente (sin 16%) — prueba que NO esta hardcodeado a 16%', () => {
    const filters: CuadreFilters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({
      alicuotas: [
        { impuesto_pct: 8, base_usd: 30, base_bs: 1260, monto_iva: 2.4, monto_iva_bs: 100.8 },
      ],
    })

    const { result } = renderHook(() => useIvaPorAlicuotaNC(filters))

    expect(result.current.alicuotas).toHaveLength(1)
    expect(result.current.alicuotas[0].impuestoPct).toBe(8)
  })

  it('filtra POR SESION (sesion_caja_id IN) en ambas queries, NO por fecha — fix del bug latente de totalNcr', () => {
    const filters: CuadreFilters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1', 'sesion-2'] }
    setup({ alicuotas: [], header: { total_exento: 0, total_exento_bs: 0, total_nc: 0, total_nc_bs: 0 } })

    renderHook(() => useIvaPorAlicuotaNC(filters))

    const alicuotaCall = mockedUseQuery.mock.calls.find(([sql]) => (sql as string).includes('FROM notas_credito_det'))
    const headerCall = mockedUseQuery.mock.calls.find(
      ([sql]) => (sql as string).includes('FROM notas_credito') && !(sql as string).includes('FROM notas_credito_det')
    )

    expect(alicuotaCall?.[0]).toContain('sesion_caja_id IN')
    expect(alicuotaCall?.[0]).not.toContain("DATE(")
    expect(alicuotaCall?.[1]).toEqual(['emp-1', 'sesion-1', 'sesion-2'])

    expect(headerCall?.[0]).toContain('sesion_caja_id IN')
    expect(headerCall?.[0]).not.toContain("DATE(")
    expect(headerCall?.[1]).toEqual(['emp-1', 'sesion-1', 'sesion-2'])
  })

  it('usa montos ya persistidos a tasa HISTORICA (subtotal_bs/total_bs) — sin JOIN a tasa actual', () => {
    const filters: CuadreFilters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({
      alicuotas: [{ impuesto_pct: 16, base_usd: 100, base_bs: 4200, monto_iva: 16, monto_iva_bs: 672 }],
      header: { total_exento: 0, total_exento_bs: 0, total_nc: 0, total_nc_bs: 0 },
    })

    const { result } = renderHook(() => useIvaPorAlicuotaNC(filters))

    // 4200 Bs es la tasa HISTORICA (42) — si el hook recalculara con otra tasa
    // (ej. tasaPromedio actual) este numero no coincidiria con el mock.
    expect(result.current.alicuotas[0].baseBs).toBe(4200)

    const alicuotaCall = mockedUseQuery.mock.calls.find(([sql]) => (sql as string).includes('FROM notas_credito_det'))
    const headerCall = mockedUseQuery.mock.calls.find(
      ([sql]) => (sql as string).includes('FROM notas_credito') && !(sql as string).includes('FROM notas_credito_det')
    )
    expect(alicuotaCall?.[0]).toContain('subtotal_bs')
    expect(alicuotaCall?.[0]).not.toContain('tasas_cambio')
    expect(headerCall?.[0]).toContain('total_bs')
    expect(headerCall?.[0]).not.toContain('tasas_cambio')
  })

  it('totalNcrExentoUsd/Bs: agregado condicional desde el header de notas_credito', () => {
    const filters: CuadreFilters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({
      alicuotas: [],
      header: { total_exento: 200, total_exento_bs: 8400, total_nc: 200, total_nc_bs: 8400 },
    })

    const { result } = renderHook(() => useIvaPorAlicuotaNC(filters))

    expect(result.current.totalNcrExentoUsd).toBe(200)
    expect(result.current.totalNcrExentoBs).toBe(8400)
  })

  it('triangulacion: sin exento (0) — no rompe ni inventa un monto', () => {
    const filters: CuadreFilters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({
      alicuotas: [{ impuesto_pct: 16, base_usd: 100, base_bs: 4200, monto_iva: 16, monto_iva_bs: 672 }],
      header: { total_exento: 0, total_exento_bs: 0, total_nc: 116, total_nc_bs: 4872 },
    })

    const { result } = renderHook(() => useIvaPorAlicuotaNC(filters))

    expect(result.current.totalNcrExentoUsd).toBe(0)
    expect(result.current.totalNcrExentoBs).toBe(0)
  })

  it('totalNcrBaseUsd/Bs: agregado de base imponible NC (nuevo campo) — insumo para el subtotal antes de impuestos de Devoluciones', () => {
    const filters: CuadreFilters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({
      alicuotas: [{ impuesto_pct: 16, base_usd: 100, base_bs: 4200, monto_iva: 16, monto_iva_bs: 672 }],
      header: { total_exento: 0, total_exento_bs: 0, total_nc: 116, total_nc_bs: 4872, total_base: 100, total_base_bs: 4200 },
    })

    const { result } = renderHook(() => useIvaPorAlicuotaNC(filters))

    expect(result.current.totalNcrBaseUsd).toBe(100)
    expect(result.current.totalNcrBaseBs).toBe(4200)
  })

  it('triangulacion totalNcrBaseUsd/Bs: monto distinto (base+exento distintos de 0 y del total) — prueba que no es un alias de otro campo', () => {
    const filters: CuadreFilters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({
      alicuotas: [{ impuesto_pct: 8, base_usd: 30, base_bs: 1260, monto_iva: 2.4, monto_iva_bs: 100.8 }],
      header: { total_exento: 50, total_exento_bs: 2100, total_nc: 82.4, total_nc_bs: 3460.8, total_base: 30, total_base_bs: 1260 },
    })

    const { result } = renderHook(() => useIvaPorAlicuotaNC(filters))

    expect(result.current.totalNcrBaseUsd).toBe(30)
    expect(result.current.totalNcrBaseBs).toBe(1260)

    const headerCall = mockedUseQuery.mock.calls.find(
      ([sql]) => (sql as string).includes('FROM notas_credito') && !(sql as string).includes('FROM notas_credito_det')
    )
    expect(headerCall?.[0]).toContain('total_base_usd')
  })

  it('totalNcrTotalUsd/Bs: total global de NC de la sesion (para el Neto de Card 1 y Card 2)', () => {
    const filters: CuadreFilters = { fecha: '2026-09-18', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }
    setup({
      alicuotas: [{ impuesto_pct: 16, base_usd: 2331.03, base_bs: 97903.26, monto_iva: 372.97, monto_iva_bs: 15664.74 }],
      header: { total_exento: 0, total_exento_bs: 0, total_nc: 2704, total_nc_bs: 113568 },
    })

    const { result } = renderHook(() => useIvaPorAlicuotaNC(filters))

    expect(result.current.totalNcrTotalUsd).toBe(2704)
    expect(result.current.totalNcrTotalBs).toBe(113568)
  })
})
