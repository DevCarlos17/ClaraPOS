// `useFacturasSesionActiva` (Slice 5a-2a) usa `useQuery` de `@powersync/react`
// directamente — mismo patron que `use-deposito-activo.test.ts` (primer
// precedente de hooks puros de `@powersync/react` en el repo).
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/features/caja/hooks/use-sesiones-caja', () => ({ useSesionActiva: vi.fn() }))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useSesionActiva } from '@/features/caja/hooks/use-sesiones-caja'
import { useFacturasSesionActiva } from '../use-facturas-sesion-activa'

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseSesionActiva = vi.mocked(useSesionActiva)

function setup(opts: { sesionId?: string | null; rows?: unknown[] }) {
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', empresa_id: 'emp-1', email: '', nombre: '', level: 1, rol_id: null, rol_nombre: null },
    loading: false,
  })
  mockedUseSesionActiva.mockReturnValue({
    sesion: (opts.sesionId ? { id: opts.sesionId, caja_id: 'caja-1' } : null) as never,
    isLoading: false,
  })
  mockedUseQuery.mockImplementation(((sql: string) => {
    if (sql.includes('sesion_caja_id')) {
      return { data: opts.rows ?? [], isLoading: false }
    }
    return { data: [], isLoading: false }
  }) as unknown as typeof useQuery)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFacturasSesionActiva — Slice 5a-2a (Spec notas-credito-pos: alcance limitado a la sesion activa)', () => {
  it('sin sesion activa: no ejecuta la query de facturas (sql vacio) y retorna lista vacia', () => {
    setup({ sesionId: null })

    const { result } = renderHook(() => useFacturasSesionActiva())

    expect(result.current.facturas).toEqual([])
    expect(mockedUseQuery).toHaveBeenCalledWith('', [])
  })

  it('con sesion activa: ejecuta la query escopeada a empresa_id + sesion_caja_id (query-enforced, no solo UI)', () => {
    setup({ sesionId: 'sesion-1', rows: [{ id: 'venta-1', nro_factura: 'C01-000001' }] })

    const { result } = renderHook(() => useFacturasSesionActiva())

    expect(result.current.facturas).toHaveLength(1)
    const [sql, params] = mockedUseQuery.mock.calls[0]
    expect(sql).toContain('sesion_caja_id')
    expect(sql).toContain("status != 'ANULADA'")
    expect(params).toEqual(['emp-1', 'sesion-1'])
  })
})
