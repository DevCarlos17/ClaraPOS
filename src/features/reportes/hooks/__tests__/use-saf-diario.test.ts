// `useSafDiario` (use-cuadre.ts) — bug: rounding to 2 decimals INSIDE the hook
// (`.toFixed(2)`) truncates the full-precision USD amount (NUMERIC(20,8) in DB,
// e.g. 1.50800000) before it reaches the 3 consumer components that multiply
// it by `tasa` to get Bs. That premature rounding is what causes SAF Bs
// figures to show 755 instead of the correct 754 (1.508 rounded to 1.51,
// then 1.51 * 500 = 755, vs the correct 1.508 * 500 = 754).
//
// Mock pattern mirrors use-facturas-sesion-activa.test.ts (useQuery +
// useCurrentUser mocked directly, no PowerSync/db module needed since
// useSafDiario only reads via useQuery).
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useSafDiario, type CuadreFilters } from '../use-cuadre'

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

const filters: CuadreFilters = { fecha: '2026-09-15', cajaId: 'caja-1', sesionCajaIds: ['sesion-1'] }

function setup(opts: { totalSaf?: number; items?: Array<Record<string, unknown>> }) {
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', empresa_id: 'emp-1', email: '', nombre: '', level: 1, rol_id: null, rol_nombre: null },
    loading: false,
  })
  mockedUseQuery.mockImplementation(((sql: string) => {
    if (sql.includes('total_saf')) {
      return { data: [{ total_saf: opts.totalSaf ?? 0 }], isLoading: false }
    }
    if (sql.includes('movimiento_cuenta_id')) {
      return { data: opts.items ?? [], isLoading: false }
    }
    return { data: [], isLoading: false }
  }) as unknown as typeof useQuery)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSafDiario — precision (cuadre SAF Bs 755 vs 754 bug)', () => {
  it('totalUsd conserva precision completa: 1.508 NO se redondea a 1.51 dentro del hook', () => {
    setup({ totalSaf: 1.508 })

    const { result } = renderHook(() => useSafDiario(filters))

    expect(result.current.totalUsd).toBe(1.508)
  })

  it('triangulacion: 2.567 tampoco se redondea a 2.57 (prueba que no es un caso hardcodeado)', () => {
    setup({ totalSaf: 2.567 })

    const { result } = renderHook(() => useSafDiario(filters))

    expect(result.current.totalUsd).toBe(2.567)
  })

  it('items[].montoSafUsd conserva precision completa: monto=1.508 NO se redondea a 1.51', () => {
    setup({
      items: [
        {
          movimiento_cuenta_id: 'mc-1',
          venta_id: 'venta-1',
          monto: 1.508,
          tasa_pago: 500,
          nro_factura: 'C01-000001',
          total_usd: 1.508,
          cliente_nombre: 'Cliente Uno',
          otros_pagos_raw: '',
        },
      ],
    })

    const { result } = renderHook(() => useSafDiario(filters))

    expect(result.current.items[0].montoSafUsd).toBe(1.508)
  })

  it('triangulacion: monto=3.14159 se preserva sin truncar a 3.14', () => {
    setup({
      items: [
        {
          movimiento_cuenta_id: 'mc-2',
          venta_id: 'venta-2',
          monto: 3.14159,
          tasa_pago: 500,
          nro_factura: 'C01-000002',
          total_usd: 3.14159,
          cliente_nombre: 'Cliente Dos',
          otros_pagos_raw: '',
        },
      ],
    })

    const { result } = renderHook(() => useSafDiario(filters))

    expect(result.current.items[0].montoSafUsd).toBe(3.14159)
  })
})
