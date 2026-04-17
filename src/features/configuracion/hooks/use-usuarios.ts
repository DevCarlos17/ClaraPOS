import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { connector } from '@/core/db/powersync/connector'

export interface Usuario {
  id: string
  email: string
  nombre: string
  telefono: string | null
  rol_id: string | null
  empresa_id: string | null
  pin_supervisor_hash: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export function useUsuarios() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // Queries separadas para que PowerSync reaccione
  // independientemente a cambios en cada tabla
  const { data: usersData, isLoading } = useQuery(
    `SELECT * FROM usuarios WHERE empresa_id = ? ORDER BY nombre ASC`,
    [empresaId]
  )

  const { data: rolesData } = useQuery(
    empresaId ? `SELECT id, nombre FROM roles WHERE empresa_id = ?` : '',
    empresaId ? [empresaId] : []
  )

  const rolesMap = new Map(
    (rolesData ?? []).map((r) => {
      const row = r as Record<string, unknown>
      return [row.id as string, row.nombre as string]
    })
  )

  const usuarios = (usersData ?? []).map((u) => {
    const row = u as Usuario
    return {
      ...row,
      rol_nombre: row.rol_id ? (rolesMap.get(row.rol_id) ?? null) : null,
    }
  })

  return {
    usuarios: usuarios as (Usuario & { rol_nombre: string | null })[],
    isLoading,
  }
}

export async function crearEmpleado(
  nombre: string,
  email: string,
  password: string,
  rolId: string,
  telefono?: string
) {
  return connector.createEmployee(nombre, email, password, rolId, telefono)
}

export async function actualizarEmpleado(
  userId: string,
  updates: { rol_id?: string; is_active?: boolean; nombre?: string; telefono?: string; password?: string }
) {
  return connector.updateEmployee(userId, updates)
}

export async function toggleEmpleado(userId: string, isActive: boolean) {
  return connector.updateEmployee(userId, { is_active: isActive })
}

export { setSupervisorPin } from './use-supervisor-pin'
