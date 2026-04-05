import type { ReactNode } from 'react'
import { usePermissions, type PermissionKey } from '@/core/hooks/use-permissions'

interface RequirePermissionProps {
  permission: PermissionKey | PermissionKey[]
  requireAll?: boolean
  fallback?: ReactNode
  children: ReactNode
}

export function RequirePermission({
  permission,
  requireAll = false,
  fallback = null,
  children,
}: RequirePermissionProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = usePermissions()

  if (loading) return null

  const allowed = Array.isArray(permission)
    ? requireAll
      ? hasAllPermissions(permission)
      : hasAnyPermission(permission)
    : hasPermission(permission)

  if (!allowed) return <>{fallback}</>

  return <>{children}</>
}
