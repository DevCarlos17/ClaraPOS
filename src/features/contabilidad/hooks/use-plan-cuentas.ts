import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

// ─── Interfaces ─────────────────────────────────────────────

export interface CuentaContable {
  id: string
  empresa_id: string
  codigo: string
  nombre: string
  tipo: string
  parent_id: string | null
  nivel: number
  es_cuenta_detalle: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Plan de cuentas completo de la empresa, ordenado por codigo ascendente.
 */
export function usePlanCuentas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM plan_cuentas WHERE empresa_id = ? ORDER BY codigo ASC',
    [empresaId]
  )

  return { cuentas: (data ?? []) as CuentaContable[], isLoading }
}

/**
 * Solo cuentas de detalle activas (es_cuenta_detalle = 1 AND is_active = 1).
 * Estas son las unicas que pueden usarse en transacciones como gastos.
 */
export function useCuentasDetalle() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM plan_cuentas
     WHERE empresa_id = ? AND es_cuenta_detalle = 1 AND is_active = 1
     ORDER BY codigo ASC`,
    [empresaId]
  )

  return { cuentas: (data ?? []) as CuentaContable[], isLoading }
}

// ─── Funciones de escritura ──────────────────────────────────

export async function crearCuenta(data: {
  codigo: string
  nombre: string
  tipo: 'GASTO' | 'INGRESO_OTRO'
  parent_id?: string
  nivel: number
  es_cuenta_detalle: boolean
  empresa_id: string
  created_by?: string
}): Promise<string> {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('plan_cuentas')
    .values({
      id,
      empresa_id: data.empresa_id,
      codigo: data.codigo.toUpperCase(),
      nombre: data.nombre.toUpperCase(),
      tipo: data.tipo,
      parent_id: data.parent_id ?? null,
      nivel: data.nivel,
      es_cuenta_detalle: data.es_cuenta_detalle ? 1 : 0,
      is_active: 1,
      created_at: now,
      updated_at: now,
      created_by: data.created_by ?? null,
      updated_by: null,
    })
    .execute()

  return id
}

/**
 * Actualiza una cuenta contable.
 * NOTA: El codigo es inmutable despues de la creacion y no se incluye aqui.
 */
export async function actualizarCuenta(
  id: string,
  data: {
    nombre?: string
    tipo?: 'GASTO' | 'INGRESO_OTRO'
    parent_id?: string | null
    nivel?: number
    es_cuenta_detalle?: boolean
    is_active?: boolean
    updated_by?: string
  }
): Promise<void> {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.tipo !== undefined) updates.tipo = data.tipo
  if (data.parent_id !== undefined) updates.parent_id = data.parent_id ?? null
  if (data.nivel !== undefined) updates.nivel = data.nivel
  if (data.es_cuenta_detalle !== undefined)
    updates.es_cuenta_detalle = data.es_cuenta_detalle ? 1 : 0
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by ?? null

  await kysely.updateTable('plan_cuentas').set(updates).where('id', '=', id).execute()
}
