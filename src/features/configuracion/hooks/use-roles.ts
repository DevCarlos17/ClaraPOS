import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { connector } from '@/core/db/powersync/connector'

export interface Rol {
  id: string
  nombre: string
  descripcion: string | null
  is_system: number
}

export interface Permiso {
  id: string
  modulo: string
  slug: string
  nombre: string
  descripcion: string | null
}

export function useRoles() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    empresaId
      ? 'SELECT id, nombre, descripcion, is_system FROM roles WHERE empresa_id = ? AND is_active = 1 AND is_system = 0 ORDER BY nombre ASC'
      : '',
    empresaId ? [empresaId] : []
  )

  const roles = (data ?? []) as Rol[]

  return { roles, isLoading }
}

export function usePermisos() {
  const { data, isLoading } = useQuery(
    'SELECT id, modulo, slug, nombre, descripcion FROM permisos WHERE is_active = 1 ORDER BY modulo, nombre'
  )

  const permisos = (data ?? []) as Permiso[]

  const permisosByModule = permisos.reduce<Record<string, Permiso[]>>((acc, p) => {
    const mod = p.modulo.charAt(0).toUpperCase() + p.modulo.slice(1)
    if (!acc[mod]) acc[mod] = []
    acc[mod].push(p)
    return acc
  }, {})

  return { permisos, permisosByModule, isLoading }
}

export function useRolPermisos(rolId: string) {
  const { data, isLoading } = useQuery(
    rolId
      ? 'SELECT p.id, p.modulo, p.slug, p.nombre, p.descripcion FROM rol_permisos rp JOIN permisos p ON rp.permiso_id = p.id WHERE rp.rol_id = ? ORDER BY p.modulo, p.nombre'
      : '',
    rolId ? [rolId] : []
  )

  const permisos = (data ?? []) as Permiso[]

  const permisosAgrupados = permisos.reduce<Record<string, Permiso[]>>((acc, p) => {
    const mod = p.modulo.charAt(0).toUpperCase() + p.modulo.slice(1)
    if (!acc[mod]) acc[mod] = []
    acc[mod].push(p)
    return acc
  }, {})

  return { permisos, permisosAgrupados, isLoading }
}

export async function crearRolPersonalizado(
  nombre: string,
  descripcion: string,
  permisoIds: string[]
) {
  return connector.createRole(nombre, descripcion, permisoIds)
}
