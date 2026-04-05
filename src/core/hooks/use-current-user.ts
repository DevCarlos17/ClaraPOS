import { useQuery } from '@powersync/react'
import { useAuth } from '@/core/auth/auth-provider'

interface CurrentUser {
  id: string
  email: string
  nombre: string
  level: number
  empresa_id: string | null
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const { user: authUser } = useAuth()

  const { data, isLoading } = useQuery(
    `SELECT id, email, nombre, level, empresa_id FROM usuarios WHERE id = ?`,
    [authUser?.id ?? ''],
    { runQueryOnce: false }
  )

  if (!authUser) {
    return { user: null, loading: isLoading }
  }

  // 1. Prefer local PowerSync data (synced from Supabase)
  if (data && data.length > 0) {
    const row = data[0] as Record<string, unknown>
    return {
      user: {
        id: row.id as string,
        email: row.email as string,
        nombre: row.nombre as string,
        level: (row.level as number) ?? 3,
        empresa_id: (row.empresa_id as string) ?? null,
      },
      loading: false,
    }
  }

  // 2. Fallback: use JWT user_metadata (available immediately, no queries needed)
  const meta = authUser.user_metadata as Record<string, unknown> | undefined
  const level = typeof meta?.level === 'number' ? meta.level : 3
  const nombre = typeof meta?.nombre === 'string' ? meta.nombre : (authUser.email ?? '')
  const empresaId = typeof meta?.empresa_id === 'string' ? meta.empresa_id : null

  return {
    user: {
      id: authUser.id,
      email: authUser.email ?? '',
      nombre,
      level,
      empresa_id: empresaId,
    },
    loading: false,
  }
}
