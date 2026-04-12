import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

// ─── Interfaces ─────────────────────────────────────────────

export interface ProveedorBanco {
  id: string
  empresa_id: string
  proveedor_id: string
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta: string | null
  titular: string | null
  titular_documento: string | null
  moneda_id: string | null
  is_active: number
  created_at: string
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Bancos registrados para un proveedor especifico.
 * Solo retorna registros activos (is_active = 1).
 */
export function useBancosProveedor(proveedorId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    proveedorId
      ? `SELECT * FROM proveedores_bancos
         WHERE empresa_id = ? AND proveedor_id = ? AND is_active = 1
         ORDER BY nombre_banco ASC`
      : '',
    proveedorId ? [empresaId, proveedorId] : []
  )

  return { bancos: (data ?? []) as ProveedorBanco[], isLoading }
}

// ─── Funciones de escritura ──────────────────────────────────

export async function crearBancoProveedor(data: {
  proveedor_id: string
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta?: string
  titular?: string
  titular_documento?: string
  moneda_id?: string
  empresa_id: string
}): Promise<string> {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('proveedores_bancos')
    .values({
      id,
      empresa_id: data.empresa_id,
      proveedor_id: data.proveedor_id,
      nombre_banco: data.nombre_banco.toUpperCase(),
      nro_cuenta: data.nro_cuenta,
      tipo_cuenta: data.tipo_cuenta ?? null,
      titular: data.titular ? data.titular.toUpperCase() : null,
      titular_documento: data.titular_documento ? data.titular_documento.toUpperCase() : null,
      moneda_id: data.moneda_id ?? null,
      is_active: 1,
      created_at: now,
    })
    .execute()

  return id
}

export async function actualizarBancoProveedor(
  id: string,
  data: {
    nombre_banco?: string
    nro_cuenta?: string
    tipo_cuenta?: string | null
    titular?: string | null
    titular_documento?: string | null
    moneda_id?: string | null
    is_active?: boolean
  }
): Promise<void> {
  const updates: Record<string, unknown> = {}

  if (data.nombre_banco !== undefined) updates.nombre_banco = data.nombre_banco.toUpperCase()
  if (data.nro_cuenta !== undefined) updates.nro_cuenta = data.nro_cuenta
  if (data.tipo_cuenta !== undefined) updates.tipo_cuenta = data.tipo_cuenta ?? null
  if (data.titular !== undefined) updates.titular = data.titular ? data.titular.toUpperCase() : null
  if (data.titular_documento !== undefined)
    updates.titular_documento = data.titular_documento
      ? data.titular_documento.toUpperCase()
      : null
  if (data.moneda_id !== undefined) updates.moneda_id = data.moneda_id ?? null
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0

  await kysely.updateTable('proveedores_bancos').set(updates).where('id', '=', id).execute()
}
