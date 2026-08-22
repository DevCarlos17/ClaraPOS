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

export interface UltimoPrincipalGuardParams {
  /** El deposito, ANTES de aplicar la actualizacion, es el principal activo de la empresa (es_principal=1 AND is_active=1). */
  esPrincipalActivoActual: boolean
  /** La actualizacion que se esta aplicando le quita el estado de principal activo (es_principal->false, o is_active->false mientras sigue siendo es_principal=1). */
  seEstaQuitando: boolean
  /** Otro deposito de la misma empresa (excluyendo este) YA es principal activo. */
  existeOtroPrincipalActivo: boolean
}

/**
 * Invariante "al menos un deposito principal activo por empresa" (at-least-one
 * — cierra la decision de producto que quedo abierta al implementar
 * at-most-one en `buildUnsetOtrosPrincipalesQuery`). Determina si el guardado
 * debe BLOQUEARSE porque dejaria a la empresa sin ningun deposito activo con
 * es_principal=1, lo que rompe el fallback de `resolveDepositoIngreso`/
 * `resolveDepositoEgresoVenta` (`... WHERE es_principal=1 AND is_active=1
 * LIMIT 1`).
 *
 * Bloquea SOLO cuando las 3 condiciones se cumplen a la vez: el deposito es
 * ACTUALMENTE el principal activo, la operacion se lo esta quitando, y no hay
 * OTRO deposito de la empresa que ya cubra ese rol. Si existe otro principal
 * activo (ej: se acaba de marcar otro como principal, lo que via
 * `buildUnsetOtrosPrincipalesQuery` ya desmarco a este), NUNCA se bloquea —
 * la invariante at-most-one ya garantiza que queda exactamente uno.
 */
export function debeBloquearQuitarUltimoPrincipal(params: UltimoPrincipalGuardParams): boolean {
  return (
    params.esPrincipalActivoActual &&
    params.seEstaQuitando &&
    !params.existeOtroPrincipalActivo
  )
}

export interface ForzarPrincipalUnicoParams {
  /** Depositos activos de OTRAS filas (no cuenta este) que quedarian tras la operacion. */
  otrosActivosCount: number
  /** Este deposito quedara activo tras la operacion (is_active=1). */
  quedaraActivo: boolean
  /** Este deposito quedara es_principal=false tras la operacion. */
  esPrincipalFalse: boolean
}

/**
 * Invariante "deposito activo unico debe ser principal". Se evalua ANTES de
 * escribir: `otrosActivosCount` es el conteo de is_active=1 de la empresa SIN
 * contar el deposito que se esta creando/actualizando (mismo criterio que
 * `existeOtroPrincipalActivo` en `debeBloquearQuitarUltimoPrincipal`).
 * Devuelve `true` cuando la operacion DEBE bloquearse: quedaria exactamente 1
 * deposito activo en la empresa y ese deposito NO es_principal, lo que rompe
 * el fallback de `resolveDepositoIngreso`/`resolveDepositoEgresoVenta`
 * (`... WHERE es_principal=1 AND is_active=1 LIMIT 1`, sin ORDER BY).
 *
 * Bloquea SOLO cuando las 3 condiciones se cumplen a la vez: no quedan otros
 * depositos activos, este deposito quedara activo, y quedara es_principal=false.
 * Si existe otro deposito activo (otrosActivosCount > 0), o este deposito no
 * quedara activo, o quedara es_principal=true, NUNCA se bloquea.
 */
export function debeForzarPrincipalUnico(params: ForzarPrincipalUnicoParams): boolean {
  return (
    params.otrosActivosCount === 0 &&
    params.quedaraActivo &&
    params.esPrincipalFalse
  )
}
