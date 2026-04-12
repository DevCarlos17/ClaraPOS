import { useQuery } from '@powersync/react'
import { useAuth } from '@/core/auth/auth-provider'

interface CurrentUser {
  id: string
  email: string
  nombre: string
  rol_id: string | null
  rol_nombre: string | null
  empresa_id: string | null
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const { user: authUser } = useAuth()

  const { data, isLoading } = useQuery(
    `SELECT u.id, u.email, u.nombre, u.rol_id, u.empresa_id, r.nombre as rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.id = ?`,
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
        rol_id: (row.rol_id as string) ?? null,
        rol_nombre: (row.rol_nombre as string) ?? null,
        empresa_id: (row.empresa_id as string) ?? null,
      },
      loading: false,
    }
  }

  // 2. Fallback: use JWT user_metadata (available immediately, no queries needed)
  const meta = authUser.user_metadata as Record<string, unknown> | undefined
  const nombre = typeof meta?.nombre === 'string' ? meta.nombre : (authUser.email ?? '')
  const empresaId = typeof meta?.empresa_id === 'string' ? meta.empresa_id : null
  const rolId = typeof meta?.rol_id === 'string' ? meta.rol_id : null

  return {
    user: {
      id: authUser.id,
      email: authUser.email ?? '',
      nombre,
      rol_id: rolId,
      rol_nombre: null,
      empresa_id: empresaId,
    },
    loading: false,
  }
}
