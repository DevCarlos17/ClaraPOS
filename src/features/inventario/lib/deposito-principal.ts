export interface UnsetPrincipalQuery {
  sql: string
  params: unknown[]
}

/**
 * Construye el UPDATE que desmarca `es_principal` en los OTROS depositos de
 * la misma empresa, para garantizar la invariante "a lo sumo un deposito
 * es_principal por empresa". `resolveDepositoIngreso`/`resolveDepositoEgresoVenta`
 * (`SELECT id FROM depositos WHERE empresa_id=? AND es_principal=1 ... LIMIT 1`,
 * sin ORDER BY) dependen de que exista a lo sumo uno; con 2+ marcados, cual
 * gana es no-determinista.
 *
 * El caller (`crearDeposito`/`actualizarDeposito`) ejecuta este UPDATE dentro
 * de la MISMA `db.writeTransaction` que inserta/actualiza el deposito que se
 * esta marcando como principal, para que la operacion sea atomica (nunca hay
 * una ventana con 0 o 2+ principales).
 *
 * `excludeId` es el propio deposito: en un UPDATE se excluye a si mismo para
 * no interferir con el UPDATE subsiguiente que lo marca como principal. En un
 * CREATE no hay excludeId — el deposito nuevo aun no existe en la tabla.
 */
export function buildUnsetOtrosPrincipalesQuery(
  empresaId: string,
  now: string,
  excludeId?: string
): UnsetPrincipalQuery {
  if (excludeId) {
    return {
      sql: 'UPDATE depositos SET es_principal = 0, updated_at = ? WHERE empresa_id = ? AND es_principal = 1 AND id != ?',
      params: [now, empresaId, excludeId],
    }
  }
  return {
    sql: 'UPDATE depositos SET es_principal = 0, updated_at = ? WHERE empresa_id = ? AND es_principal = 1',
    params: [now, empresaId],
  }
}
