import { useEffect, useState } from 'react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from './use-current-user'
import { connector } from '@/core/db/powersync/connector'

export const PERMISSIONS = {
  SALES_CREATE: 'sales.create',
  SALES_VOID: 'sales.void',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_EDIT_PRICES: 'inventory.edit_prices',
  REPORTS_VIEW: 'reports.view',
  REPORTS_CASHCLOSE: 'reports.cashclose',
  CONFIG_RATES: 'config.rates',
  CONFIG_USERS: 'config.users',
  CLIENTS_MANAGE: 'clients.manage',
  CLIENTS_CREDIT: 'clients.credit',
  CLINIC_ACCESS: 'clinic.access',
  CAJA_ACCESS: 'caja.access',
  PURCHASES_VIEW: 'purchases.view',
  ACCOUNTING_VIEW: 'accounting.view',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export function usePermissions() {
  const { user, loading: userLoading } = useCurrentUser()
  const rolId = user?.rol_id ?? ''

  // 1. Intentar obtener rol desde PowerSync (SQLite local)
  const { data: roleData, isLoading: roleLoading } = useQuery(
    rolId ? 'SELECT nombre, is_system FROM roles WHERE id = ?' : '',
    rolId ? [rolId] : []
  )

  // 2. Fallback: consultar Supabase directamente si PowerSync no tiene el rol
  const [directRole, setDirectRole] = useState<{ nombre: string; is_system: boolean } | null>(null)
  const [directLoading, setDirectLoading] = useState(false)

  useEffect(() => {
    if (rolId && !roleLoading && (!roleData || roleData.length === 0)) {
      setDirectLoading(true)
      const fetchRole = async () => {
        try {
          const { data } = await connector.client
            .from('roles')
            .select('nombre, is_system')
            .eq('id', rolId)
            .single()
          if (data) setDirectRole(data)
        } catch {
          // Silenciar error - sin conexion no podemos verificar
        }
        setDirectLoading(false)
      }
      fetchRole()
    }
  }, [rolId, roleLoading, roleData])

  const localRole = roleData?.[0] as { nombre: string; is_system: number } | undefined
  const isOwnerLocal = localRole?.nombre === 'Propietario' && localRole?.is_system === 1
  const isOwnerDirect = directRole?.nombre === 'Propietario' && directRole?.is_system === true
  const isOwner = isOwnerLocal || isOwnerDirect

  const role = localRole ?? (directRole ? { nombre: directRole.nombre, is_system: directRole.is_system ? 1 : 0 } : undefined)

  const { data: permData, isLoading: permLoading } = useQuery(
    rolId && !isOwner
      ? `SELECT p.slug FROM rol_permisos rp JOIN permisos p ON rp.permiso_id = p.id WHERE rp.rol_id = ?`
      : '',
    rolId && !isOwner ? [rolId] : []
  )

  const permissionSet = new Set(
    (permData ?? []).map((p: Record<string, unknown>) => p.slug as string)
  )

  const hasPermission = (permission: PermissionKey): boolean => {
    if (isOwner) return true
    return permissionSet.has(permission)
  }

  const hasAnyPermission = (perms: PermissionKey[]): boolean => {
    if (isOwner) return true
    return perms.some((p) => permissionSet.has(p))
  }

  const hasAllPermissions = (perms: PermissionKey[]): boolean => {
    if (isOwner) return true
    return perms.every((p) => permissionSet.has(p))
  }

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isOwner,
    rolId,
    rolNombre: role?.nombre ?? '',
    loading: userLoading || roleLoading || directLoading || (!isOwner && permLoading),
  }
}
