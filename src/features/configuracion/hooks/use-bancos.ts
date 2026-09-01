import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import Decimal from 'decimal.js'
import { toStorageString } from '@/lib/currency'
import {
  bancoTieneActividadEnSesionAbierta,
  type EjecutorSql,
} from './banco-actividad-sesion'

export { bancoTieneActividadEnSesionAbierta }
export type { EjecutorSql }

export interface Banco {
  id: string
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta: string | null
  titular: string
  titular_documento: string | null
  moneda_id: string
  /** Codigo legible de la moneda ('USD' | 'BS'), resuelto via JOIN a `monedas`.
   * Fix qa/metodo-pago-hereda-moneda-banco: el form de metodo de pago necesita
   * esto para derivar/validar la moneda del metodo contra la de su banco. */
  moneda: string
  saldo_actual: string
  saldo_inicial: string   // 0069: NUMERIC(18,4) stored as string
  cuenta_contable_id: string | null
  // 0080: cuenta de gasto por defecto para deducciones (comisiones bancarias) de este banco
  cuenta_gasto_comision_id: string | null
  // 0081 (PR-2b): cuenta BASE de comision de pasarela de pago, compartida por
  // los metodos de pago de este banco que no especifiquen cuenta propia.
  cuenta_gasto_pasarela_id: string | null
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
  // 0079: consolidar lotes POS en un traspaso (1) o uno por lote (0)
  consolidar_lotes: number
}

// Fix qa/metodo-pago-hereda-moneda-banco: mismo CASE de mapeo VES->'BS' que
// SELECT_METODOS (use-payment-methods.ts) — codigo legible, nunca el UUID crudo.
const SELECT_BANCOS_CON_MONEDA = `
  SELECT b.*,
         CASE WHEN m.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(m.codigo_iso, 'USD') END as moneda
  FROM bancos_empresa b
  LEFT JOIN monedas m ON b.moneda_id = m.id
`

export function useBancos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `${SELECT_BANCOS_CON_MONEDA} WHERE b.empresa_id = ? ORDER BY b.nombre_banco ASC`,
    [empresaId]
  )
  return { bancos: (data ?? []) as Banco[], isLoading }
}

export function useBancosActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `${SELECT_BANCOS_CON_MONEDA} WHERE b.empresa_id = ? AND b.is_active = 1 ORDER BY b.nombre_banco ASC`,
    [empresaId]
  )
  return { bancos: (data ?? []) as Banco[], isLoading }
}

/**
 * Returns all payment methods associated with a specific banco.
 *
 * Exposes `isFetching` ademas de `isLoading` (mismo patron que
 * `useDeduccionesPorMetodos`, use-metodo-cobro-deducciones.ts) porque
 * `isLoading` (de @powersync/react) es un flag de UNA SOLA VEZ que pasa a
 * `false` la primera vez que la query resuelve y NUNCA vuelve a `true`
 * cuando `bancoId` cambia despues. Como `bancoId` pasa por `''` en CADA
 * ciclo cerrar/reabrir del modal (banco-list.tsx hace
 * `setEditingBanco(undefined)` al cerrar, incluido el auto-close tras
 * guardar), un caller que solo mire `isLoading` puede leer datos STALE
 * de `data` durante el render intermedio en el que `bancoId` ya cambio al
 * id real pero la query aun no re-resolvio. Ver banco-form.tsx (guard del
 * efecto de sync, fix isFetching en useMetodosByBanco).
 */
export function useMetodosByBanco(bancoId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading, isFetching } = useQuery(
    'SELECT * FROM metodos_cobro WHERE banco_empresa_id = ? AND empresa_id = ? ORDER BY created_at ASC',
    [bancoId, empresaId]
  )
  return { data: (data ?? []) as BancoMetodo[], isLoading, isFetching }
}

export async function createBanco(params: {
  nombre_banco: string
  nro_cuenta: string
  tipo_cuenta?: string
  titular: string
  titular_documento?: string
  cuenta_contable_id?: string
  /** 0080: cuenta de gasto para comisiones bancarias, auto-creada/vinculada desde banco-form. */
  cuenta_gasto_comision_id?: string
  /** 0081 (PR-2b): cuenta BASE de comision de pasarela de pago, auto-creada/vinculada desde banco-form. */
  cuenta_gasto_pasarela_id?: string
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
          moneda_id, saldo_actual, saldo_inicial, cuenta_contable_id, cuenta_gasto_comision_id,
          cuenta_gasto_pasarela_id, is_active, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        params.cuenta_gasto_comision_id ?? null,
        params.cuenta_gasto_pasarela_id ?? null,
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
  data: {
    nombre_banco?: string
    nro_cuenta?: string
    tipo_cuenta?: string
    titular?: string
    titular_documento?: string
    cuenta_contable_id?: string | null
    // 0080: reasignable independientemente de las deducciones ya configuradas en metodos existentes
    cuenta_gasto_comision_id?: string | null
    // 0081 (PR-2b): reasignable independientemente de la cuenta de comision bancaria
    cuenta_gasto_pasarela_id?: string | null
    is_active?: boolean
  }
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
  if (data.cuenta_gasto_comision_id !== undefined) {
    sets.push('cuenta_gasto_comision_id = ?')
    values.push(data.cuenta_gasto_comision_id)
  }
  if (data.cuenta_gasto_pasarela_id !== undefined) {
    sets.push('cuenta_gasto_pasarela_id = ?')
    values.push(data.cuenta_gasto_pasarela_id)
  }
  if (data.is_active !== undefined) {
    sets.push('is_active = ?')
    values.push(data.is_active ? 1 : 0)
  }

  if (sets.length === 0) return

  const current = await db.execute(
    'SELECT is_active, empresa_id FROM bancos_empresa WHERE id = ?',
    [id]
  )
  const currentRow = current.rows?.item(0) as
    | { is_active: number; empresa_id: string }
    | undefined
  if (!currentRow) {
    throw new Error('Banco no encontrado')
  }
  const empresaId = currentRow.empresa_id

  if (data.is_active === false && currentRow.is_active === 1) {
    const tieneActividad = await bancoTieneActividadEnSesionAbierta(db, id, empresaId)
    if (tieneActividad) {
      throw new Error(
        'No se puede desactivar el banco: tiene pagos en una sesión de caja abierta.'
      )
    }
  }

  sets.push('updated_at = ?')
  values.push(localNow())
  values.push(id)
  values.push(empresaId)

  await db.execute(
    `UPDATE bancos_empresa SET ${sets.join(', ')} WHERE id = ? AND empresa_id = ?`,
    values
  )
}
