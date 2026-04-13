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

  // Query usuarios y roles por separado para que PowerSync
  // reaccione independientemente a cambios en cada tabla
  const { data: userData, isLoading: userLoading } = useQuery(
    `SELECT id, email, nombre, rol_id, empresa_id FROM usuarios WHERE id = ?`,
    [authUser?.id ?? ''],
    { runQueryOnce: false }
  )

  const userRow = (userData && userData.length > 0)
    ? userData[0] as Record<string, unknown>
    : null
  const rolId = (userRow?.rol_id as string) ?? null

  const { data: roleData } = useQuery(
    rolId ? `SELECT nombre FROM roles WHERE id = ?` : '',
    rolId ? [rolId] : []
  )

  const rolNombre = (roleData && roleData.length > 0)
    ? (roleData[0] as Record<string, unknown>).nombre as string
    : null

  if (!authUser) {
    return { user: null, loading: userLoading }
  }

  // 1. Prefer local PowerSync data (synced from Supabase)
  if (userRow) {
    return {
      user: {
        id: userRow.id as string,
        email: userRow.email as string,
        nombre: userRow.nombre as string,
        rol_id: rolId,
        rol_nombre: rolNombre,
        empresa_id: (userRow.empresa_id as string) ?? null,
      },
      loading: false,
    }
  }

  // 2. Fallback: use JWT user_metadata (available immediately, no queries needed)
  const meta = authUser.user_metadata as Record<string, unknown> | undefined
  const nombre = typeof meta?.nombre === 'string' ? meta.nombre : (authUser.email ?? '')
  const empresaId = typeof meta?.empresa_id === 'string' ? meta.empresa_id : null
  const metaRolId = typeof meta?.rol_id === 'string' ? meta.rol_id : null

  return {
    user: {
      id: authUser.id,
      email: authUser.email ?? '',
      nombre,
      rol_id: metaRolId,
      rol_nombre: rolNombre,
      empresa_id: empresaId,
    },
    loading: false,
  }
}
