import { vi } from 'vitest'
import type { ReactNode } from 'react'

export const useQuery = vi.fn().mockReturnValue({
  data: [],
  isLoading: false,
  isFetching: false,
  error: null,
})

export const useSuspenseQuery = vi.fn().mockReturnValue({
  data: [],
})

export const usePowerSync = vi.fn().mockReturnValue({
  execute: vi.fn().mockResolvedValue({ rows: { _array: [] } }),
  writeTransaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
    await cb({
      execute: vi.fn().mockResolvedValue({ rows: { _array: [] } }),
    })
  }),
  getAll: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue(null),
})

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  return children as React.ReactElement
}

export const PowerSyncContext = {
  Provider: PowerSyncProvider,
}
