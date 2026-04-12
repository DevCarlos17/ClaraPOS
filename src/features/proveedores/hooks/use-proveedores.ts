import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Proveedor {
  id: string
  razon_social: string
  nombre_comercial: string | null
  rif: string
  direccion_fiscal: string | null
  ciudad: string | null
  telefono: string | null
  email: string | null
  tipo_contribuyente: string | null
  retiene_iva: number
  retiene_islr: number
  retencion_iva_pct: string | null
  dias_credito: number
  limite_credito_usd: string
  saldo_actual: string
  is_active: number
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
    'SELECT * FROM proveedores WHERE empresa_id = ? AND is_active = 1 ORDER BY razon_social ASC',
    [empresaId]
  )
  return { proveedores: (data ?? []) as Proveedor[], isLoading }
}

export async function crearProveedor(data: {
  razon_social: string
  rif: string
  nombre_comercial?: string
  direccion_fiscal?: string
  ciudad?: string
  telefono?: string
  email?: string
  tipo_contribuyente?: string
  retiene_iva: boolean
  retiene_islr: boolean
  retencion_iva_pct?: number
  dias_credito?: number
  limite_credito_usd?: number
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
      nombre_comercial: data.nombre_comercial ? data.nombre_comercial.toUpperCase() : null,
      direccion_fiscal: data.direccion_fiscal || null,
      ciudad: data.ciudad ? data.ciudad.toUpperCase() : null,
      telefono: data.telefono || null,
      email: data.email || null,
      tipo_contribuyente: data.tipo_contribuyente || null,
      retiene_iva: data.retiene_iva ? 1 : 0,
      retiene_islr: data.retiene_islr ? 1 : 0,
      retencion_iva_pct:
        data.retencion_iva_pct != null ? data.retencion_iva_pct.toFixed(2) : null,
      dias_credito: data.dias_credito ?? 0,
      limite_credito_usd:
        data.limite_credito_usd != null ? data.limite_credito_usd.toFixed(2) : '0.00',
      saldo_actual: '0.00',
      is_active: 1,
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
    nombre_comercial?: string
    direccion_fiscal?: string
    ciudad?: string
    telefono?: string
    email?: string
    tipo_contribuyente?: string
    retiene_iva?: boolean
    retiene_islr?: boolean
    retencion_iva_pct?: number | null
    dias_credito?: number
    limite_credito_usd?: number
    is_active?: boolean
  }
) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.razon_social !== undefined) updates.razon_social = data.razon_social.toUpperCase()
  if (data.nombre_comercial !== undefined)
    updates.nombre_comercial = data.nombre_comercial ? data.nombre_comercial.toUpperCase() : null
  if (data.direccion_fiscal !== undefined) updates.direccion_fiscal = data.direccion_fiscal || null
  if (data.ciudad !== undefined)
    updates.ciudad = data.ciudad ? data.ciudad.toUpperCase() : null
  if (data.telefono !== undefined) updates.telefono = data.telefono || null
  if (data.email !== undefined) updates.email = data.email || null
  if (data.tipo_contribuyente !== undefined)
    updates.tipo_contribuyente = data.tipo_contribuyente || null
  if (data.retiene_iva !== undefined) updates.retiene_iva = data.retiene_iva ? 1 : 0
  if (data.retiene_islr !== undefined) updates.retiene_islr = data.retiene_islr ? 1 : 0
  if (data.retencion_iva_pct !== undefined)
    updates.retencion_iva_pct =
      data.retencion_iva_pct != null ? data.retencion_iva_pct.toFixed(2) : null
  if (data.dias_credito !== undefined) updates.dias_credito = data.dias_credito
  if (data.limite_credito_usd !== undefined)
    updates.limite_credito_usd = data.limite_credito_usd.toFixed(2)
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0

  await kysely.updateTable('proveedores').set(updates).where('id', '=', id).execute()
}
