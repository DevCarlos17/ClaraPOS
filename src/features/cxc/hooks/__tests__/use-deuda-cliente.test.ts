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

describe('useDeudaFacturasCliente — slice 1c (cxc-ledger-saldos-redesign): lee clientes.saldo_pendiente_usd (O(1)), ya NO agrega SUM(ventas.saldo_pend_usd) en cada render', () => {
  it('consulta CAST(saldo_pendiente_usd AS REAL) desde clientes, escopeado por id Y empresa_id, nunca saldo_actual ni SUM sobre ventas', () => {
    setCurrentUser('emp-1')
    let capturedSql = ''
    let capturedParams: unknown[] = []
    mockedUseQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
      capturedSql = sql
      capturedParams = params
      return { data: [{ deuda_usd: 350.5 }], isLoading: false }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useDeudaFacturasCliente('cliente-1'))

    expect(capturedSql).toContain('FROM clientes')
    expect(capturedSql).toContain('saldo_pendiente_usd')
    expect(capturedSql).toContain('id = ?')
    expect(capturedSql).toContain('empresa_id = ?')
    expect(capturedSql).not.toContain('saldo_actual')
    expect(capturedSql).not.toContain('SUM(CAST(saldo_pend_usd')
    expect(capturedSql).not.toContain('FROM ventas')
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

describe('useDeudaFacturasClientes — batch (IN clause): slice 1c, misma lectura directa de clientes.saldo_pendiente_usd que la version singular', () => {
  it('agrupa por id (cliente_id), escopeado por empresa_id, lee CAST(saldo_pendiente_usd AS REAL), ya NO SUM sobre ventas', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
      expect(sql).toContain('FROM clientes')
      expect(sql).toContain('saldo_pendiente_usd')
      expect(sql).toContain('empresa_id = ? AND id IN (?,?)')
      expect(sql).not.toContain('saldo_actual')
      expect(sql).not.toContain('SUM(CAST(saldo_pend_usd')
      expect(sql).not.toContain('FROM ventas')
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

describe('useCreditoFavorClientes — batch, lee clientes.saf_disponible directo (saf-snapshot-y-trazabilidad, Fase 5), escopeado por empresa_id', () => {
  it('agrupa por id (cliente_id), escopeado por empresa_id, retorna mapa clienteId -> creditoFavorUsd leido directo del snapshot, ya NO escanea movimientos_cuenta', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockImplementation(((sql: string, params: unknown[] = []) => {
      expect(sql).toContain('FROM clientes')
      expect(sql).toContain('saf_disponible')
      expect(sql).not.toContain('movimientos_cuenta')
      expect(sql).not.toContain("tipo = 'SAFC'")
      expect(sql).toContain('empresa_id = ? AND id IN (?,?)')
      expect(params).toEqual(['emp-1', 'cliente-1', 'cliente-2'])
      return {
        data: [
          { cliente_id: 'cliente-1', disponible: 150 },
          { cliente_id: 'cliente-2', disponible: 0 },
        ],
        isLoading: false,
      }
    }) as unknown as typeof useQuery)

    const { result } = renderHook(() => useCreditoFavorClientes(['cliente-1', 'cliente-2']))

    expect(result.current).toEqual({ 'cliente-1': 150, 'cliente-2': 0 })
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
