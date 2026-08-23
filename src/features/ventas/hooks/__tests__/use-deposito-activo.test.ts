// `useDepositoActivoVenta` (Slice 2a) usa `useQuery` de `@powersync/react`
// directamente (2 llamadas: caja->deposito, deposito principal) — se mockea
// el modulo completo y se discrimina por el texto del SQL, mismo enfoque que
// `deposito-list.test.tsx`. Se testea via `renderHook` (no hay precedente en
// el repo para hooks puros de `@powersync/react`, primero para este archivo).
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/features/caja/hooks/use-sesiones-caja', () => ({ useSesionActiva: vi.fn() }))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useSesionActiva } from '@/features/caja/hooks/use-sesiones-caja'
import { useDepositoActivoVenta } from '../use-deposito-activo'

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseSesionActiva = vi.mocked(useSesionActiva)

interface Fixtures {
  cajaRow?: { deposito_id: string | null; deposito_is_active?: number } | null
  principalId?: string | null
}

function setup(opts: Fixtures) {
  mockedUseCurrentUser.mockReturnValue({
    user: {
      id: 'user-1',
      empresa_id: 'emp-1',
      email: '',
      nombre: '',
      level: 1,
      rol_id: null,
      rol_nombre: null,
    },
    loading: false,
  })
  mockedUseSesionActiva.mockReturnValue({
    sesion: { id: 'sesion-1', caja_id: 'caja-1' } as never,
    isLoading: false,
  })
  mockedUseQuery.mockImplementation(((sql: string) => {
    if (sql.includes('FROM cajas')) {
      return { data: opts.cajaRow ? [opts.cajaRow] : [], isLoading: false }
    }
    if (sql.includes('es_principal')) {
      return { data: opts.principalId ? [{ id: opts.principalId }] : [], isLoading: false }
    }
    return { data: [], isLoading: false }
  }) as unknown as typeof useQuery)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDepositoActivoVenta — Slice B (guarda-deposito-inactivo): deposito de caja inactivo cae al principal para lectura de stock', () => {
  it('deposito de la caja activo (is_active=1): usa el deposito de la caja, ignora el principal', () => {
    setup({ cajaRow: { deposito_id: 'dep-caja-A', deposito_is_active: 1 }, principalId: 'dep-principal' })

    const { result } = renderHook(() => useDepositoActivoVenta())

    expect(result.current.depositoId).toBe('dep-caja-A')
  })

  it('deposito de la caja INACTIVO (is_active=0): trata cajaDepositoId como null, cae al deposito principal', () => {
    setup({ cajaRow: { deposito_id: 'dep-caja-A', deposito_is_active: 0 }, principalId: 'dep-principal' })

    const { result } = renderHook(() => useDepositoActivoVenta())

    expect(result.current.depositoId).toBe('dep-principal')
  })
})
