import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { connector } from '@/core/db/powersync/connector'

export interface Usuario {
  id: string
  email: string
  nombre: string
  level: number
  empresa_id: string | null
  activo: number
  created_at: string
  updated_at: string
}

export function useUsuarios() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM usuarios WHERE empresa_id = ? ORDER BY level ASC, nombre ASC`,
    [empresaId]
  )

  return {
    usuarios: (data ?? []) as Usuario[],
    isLoading,
  }
}

export async function crearEmpleado(
  nombre: string,
  email: string,
  password: string,
  level: number
) {
  return connector.createEmployee(nombre, email, password, level)
}

export async function actualizarEmpleado(
  userId: string,
  updates: { level?: number; activo?: boolean; nombre?: string }
) {
  return connector.updateEmployee(userId, updates)
}

export async function toggleEmpleado(userId: string, activo: boolean) {
  return connector.updateEmployee(userId, { activo })
}
