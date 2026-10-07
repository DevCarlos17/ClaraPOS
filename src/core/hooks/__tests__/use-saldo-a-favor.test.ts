// `useSaldoAFavor` usa `useQuery` de `@powersync/react` directamente — se
// mockea el modulo completo y se discrimina por el texto del SQL, mismo
// patron que `use-deuda-cliente.test.ts`.
//
// saf-snapshot-y-trazabilidad (Fase 5): read-site swap — este hook ya NO
// escanea SUM(SAFC)-SUM(SAF) sobre movimientos_cuenta, lee
// clientes.saf_disponible directo (snapshot mantenido por trigger).
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useSaldoAFavor } from '../use-saldo-a-favor'

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

function setCurrentUser(empresaId: string | null) {
  mockedUseCurrentUser.mockReturnValue({
    user: empresaId
      ? { id: 'user-1', empresa_id: empresaId, email: '', nombre: '', level: 1, rol_id: null, rol_nombre: null }
      : null,
    loading: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSaldoAFavor — lee clientes.saf_disponible directo, ya NO escanea movimientos_cuenta', () => {
  it('consulta CAST(saf_disponible AS REAL) FROM clientes escopeado por id Y empresa_id, nunca movimientos_cuenta', () => {
    setCurrentUser('emp-1')
    let capturedSql = ''
    let capturedParams: unknown[] = []
    mockedUseQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
      capturedSql = sql
      capturedParams = params
      return { data: [{ disponible: 150 }], isLoading: false }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useSaldoAFavor('cliente-1'))

    expect(capturedSql).toContain('FROM clientes')
    expect(capturedSql).toContain('saf_disponible')
    expect(capturedSql).not.toContain('movimientos_cuenta')
    expect(capturedSql).not.toContain("tipo = 'SAFC'")
    expect(capturedParams).toEqual(['cliente-1', 'emp-1'])
    expect(result.current.disponible).toBe(150)
    expect(result.current.tieneSaf).toBe(true)
  })

  it('sin credito disponible (saf_disponible=0): tieneSaf=false', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation((() => ({
      data: [{ disponible: 0 }],
      isLoading: false,
    })) as unknown as typeof useQuery)

    const { result } = renderHook(() => useSaldoAFavor('cliente-1'))

    expect(result.current.disponible).toBe(0)
    expect(result.current.tieneSaf).toBe(false)
  })

  it('sin clienteId: no ejecuta query (string vacio, params vacios) y retorna disponible 0', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
      expect(sql).toBe('')
      expect(params).toEqual([])
      return { data: [], isLoading: false }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useSaldoAFavor(null))

    expect(result.current.disponible).toBe(0)
    expect(result.current.tieneSaf).toBe(false)
  })
})
