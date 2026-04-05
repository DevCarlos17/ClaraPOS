import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export interface Company {
  id: string
  nombre: string
  rif: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  nro_fiscal: string | null
  regimen: string | null
  activo: number
  created_at: string
  updated_at: string
}

export function useCompany() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM empresas WHERE id = ?',
    [empresaId]
  )

  return {
    company: (data?.[0] as Company | undefined) ?? null,
    isLoading,
  }
}

export async function updateCompany(
  id: string,
  data: {
    nombre?: string
    rif?: string
    direccion?: string
    telefono?: string
    email?: string
    nro_fiscal?: string
    regimen?: string
  }
) {
  const updates: Record<string, unknown> = {}

  if (data.nombre !== undefined) updates.nombre = data.nombre
  if (data.rif !== undefined) updates.rif = data.rif || null
  if (data.direccion !== undefined) updates.direccion = data.direccion || null
  if (data.telefono !== undefined) updates.telefono = data.telefono || null
  if (data.email !== undefined) updates.email = data.email || null
  if (data.nro_fiscal !== undefined) updates.nro_fiscal = data.nro_fiscal || null
  if (data.regimen !== undefined) updates.regimen = data.regimen || null

  await kysely.updateTable('empresas').set(updates).where('id', '=', id).execute()
}
