// `useDeudaFacturasCliente`/`useDeudaFacturasClientes` usan `useQuery` de
// `@powersync/react` directamente — se mockea el modulo completo y se
// discrimina por el texto del SQL, mismo enfoque que
// use-deposito-activo.test.ts (primer precedente de este patron en el repo).
//
// COBERTURA — que prueba y que NO prueba este archivo (honestidad de alcance,
// WARNING 2 de la review de cxc-saldo-favor-modelo):
// - SI prueba: que la fuente de datos del gate de limite de credito del POS
//   (`deudaFacturasUsd`) viene de `SUM(ventas.saldo_pend_usd)` filtrado por
//   `cliente_id` Y `empresa_id`, nunca de `clientes.saldo_actual` (neteado).
// - NO prueba: la llamada real a `calcularDisponibleCredito(limite, deudaFacturasUsd)`
//   dentro de `cobro-modal.tsx` (`handleProcesar`, ~linea 354-369) — ese gate de
//   ENFORCEMENT vive inline en un componente grande con muchas dependencias
//   (useIgtfConfig, useSaldoAFavor, useFacturasPendientes, SupervisorPinDialog,
//   etc.). Un test de componente completo fue evaluado como desproporcionado
//   para este hardening pass. La formula de 2 argumentos (sin termino SAF) ya
//   esta cubierta por `deuda-credito-cliente.test.ts` (funcion pura), y el
//   flujo end-to-end esta documentado en manual-verify.md (Test 7).
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useDeudaFacturasCliente, useDeudaFacturasClientes, useCreditoFavorClientes } from '../use-deuda-cliente'

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

describe('useDeudaFacturasCliente — fuente del gate de limite de credito (SUM(ventas.saldo_pend_usd), NO saldo_actual)', () => {
  it('consulta SUM(ventas.saldo_pend_usd) escopeado por cliente_id Y empresa_id, nunca clientes.saldo_actual', () => {
    setCurrentUser('emp-1')
    let capturedSql = ''
    let capturedParams: unknown[] = []
    mockedUseQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
      capturedSql = sql
      capturedParams = params
      return { data: [{ deuda_usd: 350.5 }], isLoading: false }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useDeudaFacturasCliente('cliente-1'))

    expect(capturedSql).toContain('FROM ventas')
    expect(capturedSql).toContain('cliente_id = ?')
    expect(capturedSql).toContain('empresa_id = ?')
    expect(capturedSql).not.toContain('saldo_actual')
    expect(capturedParams).toEqual(['cliente-1', 'emp-1'])
    expect(result.current.deudaFacturasUsd).toBe(350.5)
  })

  it('sin clienteId: no ejecuta query (string vacio, params vacios) y retorna deuda 0', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
      expect(sql).toBe('')
      expect(params).toEqual([])
      return { data: [], isLoading: false }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useDeudaFacturasCliente(null))

    expect(result.current.deudaFacturasUsd).toBe(0)
  })
})

describe('useDeudaFacturasClientes — batch (IN clause), misma fuente que la version singular', () => {
  it('agrupa por cliente_id, escopeado por empresa_id, retorna mapa clienteId -> deudaFacturasUsd', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
      expect(sql).toContain('empresa_id = ? AND cliente_id IN (?,?)')
      expect(sql).not.toContain('saldo_actual')
      expect(params).toEqual(['emp-1', 'cliente-1', 'cliente-2'])
      return {
        data: [
          { cliente_id: 'cliente-1', deuda_usd: 100 },
          { cliente_id: 'cliente-2', deuda_usd: 0 },
        ],
        isLoading: false,
      }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useDeudaFacturasClientes(['cliente-1', 'cliente-2']))

    expect(result.current).toEqual({ 'cliente-1': 100, 'cliente-2': 0 })
  })

  it('lista vacia: no ejecuta query, retorna mapa vacio', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation(((sql: string) => {
      expect(sql).toBe('')
      return { data: [], isLoading: false }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useDeudaFacturasClientes([]))

    expect(result.current).toEqual({})
  })
})

describe('useCreditoFavorClientes — batch de saldo a favor (SUM(SAFC)-SUM(SAF)), escopeado por empresa_id', () => {
  it('agrupa por cliente_id, escopeado por empresa_id, retorna mapa clienteId -> creditoFavorUsd (MAX(0, creado-consumido))', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
      expect(sql).toContain('FROM movimientos_cuenta')
      expect(sql).toContain("tipo = 'SAFC'")
      expect(sql).toContain("tipo = 'SAF'")
      expect(sql).toContain('empresa_id = ? AND cliente_id IN (?,?)')
      expect(sql).not.toContain('saldo_actual')
      expect(params).toEqual(['emp-1', 'cliente-1', 'cliente-2'])
      return {
        data: [
          { cliente_id: 'cliente-1', creado: 200, consumido: 50 },
          { cliente_id: 'cliente-2', creado: 0, consumido: 0 },
        ],
        isLoading: false,
      }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useCreditoFavorClientes(['cliente-1', 'cliente-2']))

    expect(result.current).toEqual({ 'cliente-1': 150, 'cliente-2': 0 })
  })

  it('clampa a 0 cuando consumido > creado (dato inconsistente nunca da credito negativo)', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation((() => ({
      data: [{ cliente_id: 'cliente-1', creado: 10, consumido: 40 }],
      isLoading: false,
    })) as unknown as typeof useQuery)

    const { result } = renderHook(() => useCreditoFavorClientes(['cliente-1']))

    expect(result.current).toEqual({ 'cliente-1': 0 })
  })

  it('lista vacia: no ejecuta query, retorna mapa vacio', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation(((sql: string) => {
      expect(sql).toBe('')
      return { data: [], isLoading: false }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useCreditoFavorClientes([]))

    expect(result.current).toEqual({})
  })
})
