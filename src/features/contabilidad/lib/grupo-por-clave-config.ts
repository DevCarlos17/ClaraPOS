/**
 * Lookup puro (sin dependencias de PowerSync) para resolver un grupo del
 * plan de cuentas via su clave en `cuentas_config`.
 *
 * Mismo motivo que `banco-actividad-sesion.ts`: `banco-form.tsx` necesita
 * ejecutar esta MISMA consulta de forma DIRECTA e imperativa (via
 * `db.execute`) en el momento exacto de crear las cuentas del banco, en vez
 * de leer el resultado por closure de un hook reactivo PowerSync
 * (`useGrupoPorClaveConfig`, `use-plan-cuentas.ts`). El hook reactivo puede
 * estar `undefined` si su `useQuery` todavia no resolvio en la sesion actual
 * del navegador — causa raiz confirmada (Engram obs #2637) de bancos
 * guardados con `cuenta_gasto_comision_id`/`cuenta_gasto_pasarela_id` NULL.
 * Extraer el lookup aqui permite testearlo con un `EjecutorSql` mockeado,
 * sin arrastrar el efecto secundario de modulo de PowerSync ("Worker is not
 * defined" bajo Vitest).
 */
export interface EjecutorSql {
  execute: (
    sql: string,
    params: unknown[]
  ) => Promise<{ rows?: { item: (i: number) => unknown; length: number } }>
}

export interface GrupoCuenta {
  id: string
  codigo: string
  nivel: number
}

/**
 * Resuelve un grupo del plan de cuentas por su `clave` en `cuentas_config`,
 * scoped por `empresaId` (aislamiento multi-tenant). Query identica a
 * `useGrupoPorClaveConfig` (`use-plan-cuentas.ts:132-147`) — solo cambia el
 * sentinel de "no resuelto" (`null` en vez de `undefined`, ya que esta
 * funcion no es un hook de React).
 */
export async function resolverGrupoPorClaveConfig(
  ejecutor: EjecutorSql,
  clave: string,
  empresaId: string
): Promise<GrupoCuenta | null> {
  const result = await ejecutor.execute(
    `SELECT pc.id AS id, pc.codigo AS codigo, pc.nivel AS nivel
     FROM cuentas_config cc
     JOIN plan_cuentas pc ON pc.id = cc.cuenta_contable_id
     WHERE cc.empresa_id = ? AND cc.clave = ?
     LIMIT 1`,
    [empresaId, clave]
  )
  if (!result.rows || result.rows.length === 0) return null
  return result.rows.item(0) as GrupoCuenta
}
