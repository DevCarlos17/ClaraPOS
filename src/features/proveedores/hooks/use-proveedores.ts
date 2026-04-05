import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Proveedor {
  id: string
  razon_social: string
  rif: string
  direccion_fiscal: string | null
  telefono: string | null
  correo: string | null
  retiene_iva: number
  retiene_islr: number
  activo: number
  created_at: string
  updated_at: string
}

export function useProveedores() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM proveedores WHERE empresa_id = ? ORDER BY razon_social ASC',
    [empresaId]
  )
  return { proveedores: (data ?? []) as Proveedor[], isLoading }
}

export function useProveedoresActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM proveedores WHERE empresa_id = ? AND activo = 1 ORDER BY razon_social ASC',
    [empresaId]
  )
  return { proveedores: (data ?? []) as Proveedor[], isLoading }
}

export async function crearProveedor(data: {
  razon_social: string
  rif: string
  direccion_fiscal?: string
  telefono?: string
  correo?: string
  retiene_iva: boolean
  retiene_islr: boolean
  empresa_id: string
}) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('proveedores')
    .values({
      id,
      razon_social: data.razon_social.toUpperCase(),
      rif: data.rif.toUpperCase(),
      direccion_fiscal: data.direccion_fiscal || null,
      telefono: data.telefono || null,
      correo: data.correo || null,
      retiene_iva: data.retiene_iva ? 1 : 0,
      retiene_islr: data.retiene_islr ? 1 : 0,
      activo: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarProveedor(
  id: string,
  data: {
    razon_social?: string
    direccion_fiscal?: string
    telefono?: string
    correo?: string
    retiene_iva?: boolean
    retiene_islr?: boolean
    activo?: boolean
  }
) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.razon_social !== undefined) updates.razon_social = data.razon_social.toUpperCase()
  if (data.direccion_fiscal !== undefined) updates.direccion_fiscal = data.direccion_fiscal || null
  if (data.telefono !== undefined) updates.telefono = data.telefono || null
  if (data.correo !== undefined) updates.correo = data.correo || null
  if (data.retiene_iva !== undefined) updates.retiene_iva = data.retiene_iva ? 1 : 0
  if (data.retiene_islr !== undefined) updates.retiene_islr = data.retiene_islr ? 1 : 0
  if (data.activo !== undefined) updates.activo = data.activo ? 1 : 0

  await kysely.updateTable('proveedores').set(updates).where('id', '=', id).execute()
}
