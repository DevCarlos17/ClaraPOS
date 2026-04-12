import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { connector } from '@/core/db/powersync/connector'

export interface Usuario {
  id: string
  email: string
  nombre: string
  rol_id: string | null
  empresa_id: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export function useUsuarios() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT u.*, r.nombre as rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.empresa_id = ? ORDER BY u.nombre ASC`,
    [empresaId]
  )

  return {
    usuarios: (data ?? []) as (Usuario & { rol_nombre: string | null })[],
    isLoading,
  }
}

export async function crearEmpleado(
  nombre: string,
  email: string,
  password: string,
  rolId: string
) {
  return connector.createEmployee(nombre, email, password, rolId)
}

export async function actualizarEmpleado(
  userId: string,
  updates: { rol_id?: string; is_active?: boolean; nombre?: string }
) {
  return connector.updateEmployee(userId, updates)
}

export async function toggleEmpleado(userId: string, isActive: boolean) {
  return connector.updateEmployee(userId, { is_active: isActive })
}
