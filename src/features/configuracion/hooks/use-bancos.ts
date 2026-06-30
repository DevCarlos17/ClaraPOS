import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import Decimal from 'decimal.js'
import { toStorageString } from '@/lib/currency'

export interface Banco {
  id: string
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta: string | null
  titular: string
  titular_documento: string | null
  moneda_id: string
  saldo_actual: string
  saldo_inicial: string   // 0069: NUMERIC(18,4) stored as string
  cuenta_contable_id: string | null
  is_active: number
  empresa_id: string
  created_at: string
  updated_at: string
  created_by: string | null
}

/** Minimal type for metodos_cobro rows associated with a banco. */
export interface BancoMetodo {
  id: string
  empresa_id: string
  nombre: string
  tipo: string
  moneda_id: string
  banco_empresa_id: string | null
  caja_fuerte_id: string | null
  requiere_referencia: number
  saldo_actual: string
  is_active: number
  deposito_directo: number   // 0|1
  comision_pct: string
  usa_pos: number            // 0|1
  usa_cxc: number            // 0|1
  usa_cxp: number            // 0|1
  created_at: string
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

/** Returns all payment methods associated with a specific banco. */
export function useMetodosByBanco(bancoId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM metodos_cobro WHERE banco_empresa_id = ? AND empresa_id = ? ORDER BY created_at ASC',
    [bancoId, empresaId]
  )
  return { data: (data ?? []) as BancoMetodo[], isLoading }
}

export async function createBanco(params: {
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta?: string
  titular: string
  titular_documento?: string
  cuenta_contable_id?: string
  /** Currency code for this bank account: 'USD' or 'BS' (mapped to VES internally). */
  moneda_id: 'USD' | 'BS'
  /** Initial balance as a string — stored with 8 decimal places. */
  saldo_inicial: string
  empresa_id: string
  usuario_id: string
}) {
  const id = uuidv4()
  const now = localNow()
  const saldoStorage = toStorageString(new Decimal(params.saldo_inicial || '0'))

  await db.writeTransaction(async (tx) => {
    // Resolve moneda UUID from code
    const monedaCode = params.moneda_id === 'BS' ? 'VES' : 'USD'
    const monedaResult = await tx.execute(
      'SELECT id FROM monedas WHERE codigo_iso = ? LIMIT 1',
      [monedaCode]
    )
    if (!monedaResult.rows?.length) {
      throw new Error(`No se encontro la moneda ${monedaCode} en el catalogo`)
    }
    const monedaId = (monedaResult.rows.item(0) as { id: string }).id

    await tx.execute(
      `INSERT INTO bancos_empresa
         (id, empresa_id, nombre_banco, nro_cuenta, tipo_cuenta, titular, titular_documento,
          moneda_id, saldo_actual, saldo_inicial, cuenta_contable_id,
          is_active, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.empresa_id,
        params.nombre_banco.toUpperCase(),
        params.nro_cuenta,
        params.tipo_cuenta ?? null,
        params.titular.toUpperCase(),
        params.titular_documento ?? null,
        monedaId,
        saldoStorage,   // saldo_actual starts equal to saldo_inicial
        saldoStorage,   // saldo_inicial
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
