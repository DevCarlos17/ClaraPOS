/**
 * Decision pura del "gate" de primer arranque para el backfill de
 * `inventario_stock` (Slice 2a — cierre del WARNING: el backfill es
 * fire-and-forget y no bloquea el POS, dejando una ventana en el PRIMER
 * arranque frio de un dispositivo donde un producto legado con historial de
 * kardex pero sin fila propia en `inventario_stock` todavia se lee como 0 y
 * parece "no encontrado").
 *
 * NO modifica `ejecutarInventarioStockBackfillSiNecesario` (orquestador del
 * backfill en sí, `inventario-stock-backfill.ts`) — esta funcion solo decide
 * si el POS debe mostrar "Verificando inventario…" o renderizar normal,
 * en base a dos senales independientes del resultado especifico del
 * backfill (exito o fallo no importan aqui, solo si YA se sabia que estaba
 * hecho, o si la operacion en curso ya termino).
 */

export type BackfillGateEstado = 'listo' | 'verificando'

export interface ComputeBackfillGateEstadoParams {
  /**
   * `true` si el flag durable (`inventarioStockBackfillStore.yaEjecutado()`)
   * YA estaba marcado en el momento en que se decidio si correr el
   * backfill — es decir, este NO es el primer arranque de este dispositivo.
   * Cuando es `true`, nunca hay gate: el chequeo del flag es sincrono y
   * instantaneo, no hay "operacion en progreso" que esperar.
   */
  flagYaEstabaMarcado: boolean
  /**
   * `true` cuando la operacion asincrona del backfill (si corrio) ya
   * settled — exito O fallo, ambos casos des-gatean el POS por igual: un
   * fallo NO debe bloquear la app indefinidamente, solo degrada al
   * comportamiento de auto-reparacion perezosa pre-existente (Slice 1b) y
   * reintenta el backfill completo en el proximo arranque (el flag no se
   * marca en caso de fallo — ver `ejecutarInventarioStockBackfillSiNecesario`).
   */
  operacionTerminada: boolean
}

/**
 * `'verificando'` UNICAMENTE cuando es el primer arranque (flag ausente) Y
 * la operacion de backfill todavia esta en curso. Cualquier otra
 * combinacion resuelve a `'listo'` — incluyendo el caso de fallo, que se
 * trata igual que exito para efectos del gate (fail-safe: nunca bloquear
 * el POS permanentemente).
 */
export function computeBackfillGateEstado(
  params: ComputeBackfillGateEstadoParams
): BackfillGateEstado {
  if (params.flagYaEstabaMarcado) return 'listo'
  return params.operacionTerminada ? 'listo' : 'verificando'
}
