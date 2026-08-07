/**
 * Funciones puras que gobiernan la proyeccion de PVP al editar el Costo en
 * ProductoForm (Tab "Precios y Fiscalidad").
 *
 * Motivo: editar el Costo (USD o Bs) de un producto NO debe mutar
 * precio_venta_usd/precio_mayor_usd/precio_especial_usd directamente. En su
 * lugar, se calcula una proyeccion (que preserva el margen % configurado por
 * nivel) que el usuario debe aplicar explicitamente. Ver
 * `openspec/changes/producto-form-pvp-gating/`.
 */

/**
 * Calcula el PVP proyectado que preserva el margen % configurado para un
 * nivel de precio dado un nuevo costo.
 *
 * `costo * (1 + margenPct / 100)`, nunca negativo (clamp a 0).
 */
export function calcularPrecioPreservandoMargen(costo: number, margenPct: number): number {
  return Math.max(0, costo * (1 + margenPct / 100))
}

/**
 * Determina si un nuevo costo viola la regla de negocio #7
 * (`precio_venta_usd >= costo_usd`): el costo nunca debe ser mayor o igual
 * al PVP actualmente vigente.
 */
export function calcularViolacionCostoPvp(costoNuevo: number, pvpActual: number): boolean {
  return costoNuevo >= pvpActual
}
