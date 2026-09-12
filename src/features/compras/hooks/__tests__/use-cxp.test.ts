// `use-cxp.ts` importa `db` (`@/core/db/powersync/db`), `cargarMapaCuentas`
// (que a su vez importa `kysely`, backed por PowerSync real) y
// `generarAsientosPagoCxP`/`leerMonedaContable` — mockeados para que el
// import del modulo no construya un PowerSyncDatabase/Kysely real en el
// entorno de test (mismo patron que use-cxc.test.ts, "Worker is not
// defined" si no se mockea).
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
  },
}))
vi.mock('@/features/contabilidad/hooks/use-cuentas-config', () => ({
  cargarMapaCuentas: vi.fn(async () => ({})),
}))
vi.mock('@/features/contabilidad/lib/generar-asientos', () => ({
  generarAsientosPagoCxP: vi.fn(async () => undefined),
  leerMonedaContable: vi.fn(async () => 'USD'),
}))
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useBuscarProveedoresDeuda, type ProveedorConDeuda } from '../use-cxp'

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

describe('useBuscarProveedoresDeuda — busqueda por nombre/rif, escopeada por empresa_id (mirror de useBuscarClientesDeuda)', () => {
  it('con menos de 2 caracteres: no ejecuta query (sql vacio, params vacios) y retorna lista vacia', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    const { result } = renderHook(() => useBuscarProveedoresDeuda('a'))

    expect(mockedUseQuery).toHaveBeenCalledWith('', [])
    expect(result.current.proveedores).toEqual([])
  })

  it('con 2+ caracteres: ejecuta SQL escopeado por empresa_id, filtra razon_social/rif con LIKE %termino%, ORDER BY razon_social ASC LIMIT 20', () => {
    setCurrentUser('emp-1')
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useBuscarProveedoresDeuda('mar'))

    const [sql, params] = mockedUseQuery.mock.calls[0]!
    expect(sql).toContain('p.empresa_id = ?')
    expect(sql).toContain('p.razon_social LIKE ?')
    expect(sql).toContain('p.rif LIKE ?')
    expect(sql).toContain('ORDER BY razon_social ASC LIMIT 20')
    expect(params).toEqual(['emp-1', 'emp-1', 'emp-1', '%mar%', '%mar%'])
  })

  it('retorna los proveedores encontrados con la forma ProveedorConDeuda[]', () => {
    setCurrentUser('emp-1')
    const fila: ProveedorConDeuda = {
      id: 'prov-1',
      rif: 'J-12345678-9',
      razon_social: 'Distribuidora Marina C.A.',
      saldo_actual: '150.00000000',
      facturas_pendientes: 2,
    }
    mockedUseQuery.mockReturnValue({ data: [fila], isLoading: false } as never)

    const { result } = renderHook(() => useBuscarProveedoresDeuda('marina'))

    expect(result.current.proveedores).toEqual([fila])
    expect(result.current.isLoading).toBe(false)
  })

  it('sin empresa_id (usuario no cargado): usa empresaId vacio en los params, nunca omite el filtro', () => {
    setCurrentUser(null)
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useBuscarProveedoresDeuda('mar'))

    const [, params] = mockedUseQuery.mock.calls[0]!
    expect(params).toEqual(['', '', '', '%mar%', '%mar%'])
  })
})
