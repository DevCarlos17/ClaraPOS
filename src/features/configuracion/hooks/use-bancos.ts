import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface Banco {
  id: string
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta: string | null
  titular: string
  titular_documento: string | null
  moneda_id: string
  saldo_actual: string
  cuenta_contable_id: string | null
  is_active: number
  empresa_id: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export function useBancos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM bancos_empresa WHERE empresa_id = ? ORDER BY nombre_banco ASC',
    [empresaId]
  )
  return { bancos: (data ?? []) as Banco[], isLoading }
}

export function useBancosActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM bancos_empresa WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre_banco ASC',
    [empresaId]
  )
  return { bancos: (data ?? []) as Banco[], isLoading }
}

export async function createBanco(params: {
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta?: string
  titular: string
  titular_documento?: string
  cuenta_contable_id?: string
  empresa_id: string
  usuario_id: string
}) {
  const id = uuidv4()
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    // Buscar UUID de moneda USD
    const monedaResult = await tx.execute(
      "SELECT id FROM monedas WHERE codigo_iso = 'USD' LIMIT 1",
      []
    )
    if (!monedaResult.rows?.length) {
      throw new Error('No se encontro la moneda USD en el catalogo')
    }
    const monedaId = (monedaResult.rows.item(0) as { id: string }).id

    await tx.execute(
      `INSERT INTO bancos_empresa (id, empresa_id, nombre_banco, nro_cuenta, tipo_cuenta, titular, titular_documento, moneda_id, saldo_actual, cuenta_contable_id, is_active, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.empresa_id,
        params.nombre_banco.toUpperCase(),
        params.nro_cuenta,
        params.tipo_cuenta ?? null,
        params.titular.toUpperCase(),
        params.titular_documento ?? null,
        monedaId,
        '0.00',
        params.cuenta_contable_id ?? null,
        1,
        now,
        now,
        params.usuario_id,
      ]
    )
  })

  return id
}

export async function updateBanco(
  id: string,
  data: { nombre_banco?: string; nro_cuenta?: string; tipo_cuenta?: string; titular?: string; titular_documento?: string; cuenta_contable_id?: string | null; is_active?: boolean }
) {
  const sets: string[] = []
  const values: unknown[] = []

  if (data.nombre_banco !== undefined) {
    sets.push('nombre_banco = ?')
    values.push(data.nombre_banco.toUpperCase())
  }
  if (data.nro_cuenta !== undefined) {
    sets.push('nro_cuenta = ?')
    values.push(data.nro_cuenta)
  }
  if (data.tipo_cuenta !== undefined) {
    sets.push('tipo_cuenta = ?')
    values.push(data.tipo_cuenta)
  }
  if (data.titular !== undefined) {
    sets.push('titular = ?')
    values.push(data.titular.toUpperCase())
  }
  if (data.titular_documento !== undefined) {
    sets.push('titular_documento = ?')
    values.push(data.titular_documento)
  }
  if (data.cuenta_contable_id !== undefined) {
    sets.push('cuenta_contable_id = ?')
    values.push(data.cuenta_contable_id)
  }
  if (data.is_active !== undefined) {
    sets.push('is_active = ?')
    values.push(data.is_active ? 1 : 0)
  }

  if (sets.length === 0) return

  sets.push('updated_at = ?')
  values.push(localNow())
  values.push(id)

  await db.execute(`UPDATE bancos_empresa SET ${sets.join(', ')} WHERE id = ?`, values)
}
