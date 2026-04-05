import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Banco {
  id: string
  banco: string
  numero_cuenta: string
  cedula_rif: string
  activo: number
  empresa_id: string
  created_at: string
}

export function useBancos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM bancos WHERE empresa_id = ? ORDER BY banco ASC',
    [empresaId]
  )
  return { bancos: (data ?? []) as Banco[], isLoading }
}

export async function createBanco(
  banco: string,
  numeroCuenta: string,
  cedulaRif: string,
  companyId: string
) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('bancos')
    .values({
      id,
      banco: banco.toUpperCase(),
      numero_cuenta: numeroCuenta,
      cedula_rif: cedulaRif.toUpperCase(),
      activo: 1,
      empresa_id: companyId,
      created_at: now,
    })
    .execute()

  return id
}

export async function updateBanco(
  id: string,
  data: { banco?: string; numero_cuenta?: string; cedula_rif?: string; activo?: boolean }
) {
  const updates: Record<string, unknown> = {}

  if (data.banco !== undefined) updates.banco = data.banco.toUpperCase()
  if (data.numero_cuenta !== undefined) updates.numero_cuenta = data.numero_cuenta
  if (data.cedula_rif !== undefined) updates.cedula_rif = data.cedula_rif.toUpperCase()
  if (data.activo !== undefined) updates.activo = data.activo ? 1 : 0

  await kysely.updateTable('bancos').set(updates).where('id', '=', id).execute()
}
