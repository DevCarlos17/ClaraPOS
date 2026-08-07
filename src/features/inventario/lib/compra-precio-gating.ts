/**
 * Predicados puros que gobiernan la edicion de precios (PVP) en el flujo de Compras.
 *
 * Motivo: el usuario debe poder editar el PVP/Mayor/Especial de una linea de compra
 * sin haber cambiado el costo. Estos predicados centralizan esa decision para que
 * el formulario (compra-form.tsx) y la persistencia (use-compras.ts) usen la misma
 * logica y no diverjan.
 */

/**
 * Determina si el PVP de una linea debe mantenerse sin actualizar al enviar el
 * formulario de compra.
 *
 * Se actualiza el PVP cuando el usuario abrio el editor ("Editar precios ✎") o
 * cuando algun nivel de precio quedo violado por el nuevo costo (auto-apertura).
 * Ya NO depende de si el costo cambio: un PVP editado sin cambio de costo tambien
 * debe persistirse.
 */
export function calcularNoActualizarPvp(pvpEditando: boolean, algunNivelViolado: boolean): boolean {
  return !pvpEditando && !algunNivelViolado
}

/**
 * Determina si el resumen/confirmacion de la compra debe mostrar informacion de
 * precios para una linea (badge "precios editados"/"precios sin cambio", detalle
 * de niveles). Se muestra si hubo cambio de costo O si el usuario edito el PVP,
 * para dar paridad a la edicion de PVP sin cambio de costo.
 */
export function debeMostrarInfoPvpEnResumen(costoCambio: boolean, pvpEditando: boolean): boolean {
  return costoCambio || pvpEditando
}

export interface AccionesLineaCompra {
  /** Si true, el UPDATE a `productos` debe escribir el nuevo `costo_usd`. */
  actualizarCosto: boolean
  /** Si true, el UPDATE a `productos` debe escribir el/los PVP editados. */
  actualizarPvp: boolean
  /**
   * Si true, debe insertarse una fila de auditoria en `historico_precios`.
   * Es `actualizarCosto || actualizarPvp`: cualquier cambio de costo o de PVP
   * requiere auditoria inmutable, sin importar si el otro campo tambien cambio.
   */
  registrarAuditoria: boolean
}

/**
 * Resuelve, a partir de las dos decisiones del usuario en el formulario
 * (`costo_cambio` y `no_actualizar_pvp`), que acciones debe ejecutar la
 * persistencia de una linea de compra en `productos` y en `historico_precios`.
 *
 * Un solo predicado alimenta ambos gates en use-compras.ts (branch de UPDATE
 * ~L664 y gate de auditoria ~L742) para que no puedan quedar desincronizados.
 */
export function resolverAccionesLineaCompra(
  costoCambio: boolean,
  noActualizarPvp: boolean | undefined
): AccionesLineaCompra {
  const actualizarCosto = costoCambio === true
  // Uso de === false (no !== true): la ausencia de la señal ("no_actualizar_pvp"
  // no provisto) debe tratarse como "no tocar el PVP" por defecto — el valor
  // seguro para un sistema con auditoria inmutable. Solo un `false` EXPLICITO
  // (el usuario pidio actualizar el PVP) habilita la escritura/auditoria.
  const actualizarPvp = noActualizarPvp === false
  const registrarAuditoria = actualizarCosto || actualizarPvp

  return { actualizarCosto, actualizarPvp, registrarAuditoria }
}
