import '@testing-library/jest-dom'
import { vi } from 'vitest'
import type { ReactNode } from 'react'

/**
 * Mock global de `@powersync/react`.
 *
 * Por que: la mayoria de hooks de features (`use-current-user`, `use-permissions`,
 * `use-notas-credito`, etc.) importan `useQuery`/`usePowerSync`/`useStatus` de este
 * paquete. Sin este mock, cualquier test que NO mockee el hook localmente arrastra
 * la cadena real hasta `src/core/db/powersync/connector.ts` (y, si algo importa
 * `@/core/db/powersync/index`, hasta `db.ts`, que hace
 * `new PowerSyncDatabase(...)` en la evaluacion del modulo — carga real de
 * wa-sqlite/WASM). Ver debt #3900.
 *
 * Los tests que ya hacen `vi.mock('@powersync/react', ...)` de forma local siguen
 * ganando: Vitest resuelve el mock MAS CERCANO al modulo que se esta testeando, y
 * un `vi.mock` inline en el archivo de test tiene prioridad sobre este mock global
 * del setup file.
 */
vi.mock('@powersync/react', () => {
  const useQuery = vi.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
  })

  const useSuspenseQuery = vi.fn().mockReturnValue({
    data: [],
  })

  const usePowerSync = vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({ rows: { _array: [] } }),
    writeTransaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb({
        execute: vi.fn().mockResolvedValue({ rows: { _array: [] } }),
      })
    }),
    getAll: vi.fn().mockResolvedValue([]),
    getOptional: vi.fn().mockResolvedValue(null),
    get: vi.fn().mockResolvedValue(null),
  })

  const useStatus = vi.fn().mockReturnValue({
    connected: true,
    hasSynced: true,
    dataFlowStatus: {
      uploading: false,
      downloading: false,
      downloadError: null,
      uploadError: null,
    },
  })

  function PowerSyncProvider({ children }: { children: ReactNode }) {
    return children as React.ReactElement
  }

  const PowerSyncContext = {
    Provider: PowerSyncProvider,
  }

  return {
    useQuery,
    useSuspenseQuery,
    usePowerSync,
    useStatus,
    PowerSyncProvider,
    PowerSyncContext,
  }
})

/**
 * Mock global de `@supabase/supabase-js`.
 *
 * Por que: `src/core/db/powersync/connector.ts` instancia `new SupabaseConnector()`
 * (que llama `createClient()` real) en la evaluacion del modulo. Cualquier test que
 * arrastre `connector.ts` sin mockearlo explicitamente (p.ej. via `importOriginal`
 * sobre `use-permissions`, que importa `connector` directamente) paga el costo real
 * de construir el cliente de Supabase. Ver debt #3900.
 */
vi.mock('@supabase/supabase-js', () => {
  const createClient = vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      match: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  }))

  return { createClient }
})
