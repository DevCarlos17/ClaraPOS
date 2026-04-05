import { useQuery } from '@powersync/react'
import { useEffect, useRef } from 'react'
import { db } from '@/core/db/powersync/db'
import { connector } from '@/core/db/powersync/connector'
import { useCurrentUser } from './use-current-user'

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
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export function usePermissions() {
  const { user, loading: userLoading } = useCurrentUser()
  const level = user?.level ?? 3
  const isOwner = level === 1

  const { data, isLoading: queryLoading } = useQuery(
    'SELECT permission FROM level_permissions WHERE level = ?',
    [level],
  )

  const seeded = useRef(false)
  const permissions = (data ?? []) as { permission: string }[]

  // Fallback: if local table is empty, fetch from Supabase and seed locally
  useEffect(() => {
    if (isOwner || queryLoading || permissions.length > 0 || seeded.current) return
    seeded.current = true

    Promise.resolve(
      connector.client
        .from('level_permissions')
        .select('*')
        .eq('level', level)
    )
      .then(async ({ data: remote }) => {
        if (!remote?.length) return
        try {
          await db.writeTransaction(async (tx) => {
            for (const p of remote) {
              await tx.execute(
                'INSERT OR IGNORE INTO level_permissions (id, level, permission, created_at) VALUES (?, ?, ?, ?)',
                [p.id, p.level, p.permission, p.created_at]
              )
            }
          })
        } catch (err) {
          console.warn('[level_permissions] Error al insertar localmente:', err)
        }
      })
      .catch((err: unknown) => {
        console.warn('[level_permissions] Error al cargar desde Supabase:', err)
        seeded.current = false
      })
  }, [isOwner, queryLoading, permissions.length, level])

  const permissionSet = new Set(permissions.map((p) => p.permission))

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
    level,
    loading: userLoading || (!isOwner && queryLoading),
  }
}
