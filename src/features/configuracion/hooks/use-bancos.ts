import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Banco {
  id: string
  banco: string
  numero_cuenta: string
  cedula_rif: string
  is_active: number
  empresa_id: string
  created_at: string
}

export function useBancos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM bancos_empresa WHERE empresa_id = ? ORDER BY banco ASC',
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
    .insertInto('bancos_empresa')
    .values({
      id,
      nombre_banco: banco.toUpperCase(),
      nro_cuenta: numeroCuenta,
      titular: cedulaRif.toUpperCase(),
      moneda_id: 'USD',
      saldo_actual: '0.00',
      updated_at: now,
      is_active: 1,
      empresa_id: companyId,
      created_at: now,
    })
    .execute()

  return id
}

export async function updateBanco(
  id: string,
  data: { nombre_banco?: string; nro_cuenta?: string; titular?: string; is_active?: boolean }
) {
  const updates: Record<string, unknown> = {}

  if (data.nombre_banco !== undefined) updates.nombre_banco = data.nombre_banco.toUpperCase()
  if (data.nro_cuenta !== undefined) updates.nro_cuenta = data.nro_cuenta
  if (data.titular !== undefined) updates.titular = data.titular.toUpperCase()
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0

  await kysely.updateTable('bancos_empresa').set(updates).where('id', '=', id).execute()
}
