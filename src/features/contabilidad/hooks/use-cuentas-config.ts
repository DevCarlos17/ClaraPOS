import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { localNow } from '@/lib/dates'
import { v4 as uuidv4 } from 'uuid'

// ─── Interfaces ─────────────────────────────────────────────

export interface CuentaConfig {
  id: string
  empresa_id: string
  clave: string
  cuenta_contable_id: string
  descripcion: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
  // JOIN
  cuenta_codigo?: string
  cuenta_nombre?: string
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Lista de configuraciones de cuentas con join al plan de cuentas.
 */
export function useCuentasConfig() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT cc.*, pc.codigo as cuenta_codigo, pc.nombre as cuenta_nombre
     FROM cuentas_config cc
     JOIN plan_cuentas pc ON cc.cuenta_contable_id = pc.id
     WHERE cc.empresa_id = ?
     ORDER BY cc.clave ASC`,
    [empresaId]
  )

  return { configs: (data ?? []) as CuentaConfig[], isLoading }
}

/**
 * Obtiene la cuenta contable para una clave especifica.
 * Retorna null si no hay configuracion para esa clave.
 */
export function useCuentaConfigPorClave(clave: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT cc.cuenta_contable_id
     FROM cuentas_config cc
     WHERE cc.empresa_id = ? AND cc.clave = ?
     LIMIT 1`,
    [empresaId, clave]
  )

  const row = (data ?? [])[0] as { cuenta_contable_id: string } | undefined
  return { cuentaId: row?.cuenta_contable_id ?? null, isLoading }
}

// ─── Funciones de escritura ──────────────────────────────────

/**
 * Actualiza la cuenta contable asignada a una clave de configuracion.
 * Si la clave no existe, la crea.
 */
export async function actualizarCuentaConfig(
  clave: string,
  cuentaContableId: string,
  empresaId: string,
  userId?: string
): Promise<void> {
  const now = localNow()

  // Verificar si ya existe la clave
  const existing = await kysely
    .selectFrom('cuentas_config')
    .select('id')
    .where('empresa_id', '=', empresaId)
    .where('clave', '=', clave)
    .executeTakeFirst()

  if (existing) {
    await kysely
      .updateTable('cuentas_config')
      .set({
        cuenta_contable_id: cuentaContableId,
        updated_at: now,
        updated_by: userId ?? null,
      })
      .where('id', '=', existing.id)
      .execute()
  } else {
    await kysely
      .insertInto('cuentas_config')
      .values({
        id: uuidv4(),
        empresa_id: empresaId,
        clave,
        cuenta_contable_id: cuentaContableId,
        descripcion: null,
        created_at: now,
        updated_at: now,
        created_by: userId ?? null,
        updated_by: null,
      })
      .execute()
  }
}

/**
 * Carga el mapa completo clave->cuenta_id para la empresa.
 * Util para el generador de asientos.
 */
export async function cargarMapaCuentas(
  tx: { execute: (sql: string, params?: unknown[]) => Promise<{ rows?: { item: (i: number) => unknown; length: number } }> },
  empresaId: string
): Promise<Record<string, string>> {
  const result = await tx.execute(
    'SELECT clave, cuenta_contable_id FROM cuentas_config WHERE empresa_id = ?',
    [empresaId]
  )

  const mapa: Record<string, string> = {}
  if (result.rows) {
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i) as { clave: string; cuenta_contable_id: string }
      mapa[row.clave] = row.cuenta_contable_id
    }
  }
  return mapa
}
