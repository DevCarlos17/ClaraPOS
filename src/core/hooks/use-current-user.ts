import { useQuery } from '@powersync/react'
import { useAuth } from '@/core/auth/auth-provider'

interface CurrentUser {
  id: string
  email: string
  nombre: string
  rol: string
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const { user: authUser } = useAuth()

  const { data, isLoading } = useQuery(
    `SELECT id, email, nombre, rol FROM usuarios WHERE id = ?`,
    [authUser?.id ?? ''],
    { runQueryOnce: false }
  )

  if (!authUser || isLoading || !data || data.length === 0) {
    return {
      user: authUser
        ? {
            id: authUser.id,
            email: authUser.email ?? '',
            nombre: authUser.email ?? '',
            rol: 'cajero',
          }
        : null,
      loading: isLoading,
    }
  }

  const row = data[0] as Record<string, unknown>
  return {
    user: {
      id: row.id as string,
      email: row.email as string,
      nombre: row.nombre as string,
      rol: row.rol as string,
    },
    loading: false,
  }
}
