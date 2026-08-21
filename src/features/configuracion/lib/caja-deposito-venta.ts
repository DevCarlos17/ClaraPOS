/**
 * Defensa en profundidad para la Validacion 3 (caja requiere un deposito con
 * permite_venta = true). El select del formulario ya filtra por
 * `useDepositosVentaActivos()`, pero un deposito puede haber sido
 * desactivado para ventas en otra sesion mientras el formulario seguia
 * abierto (edicion) — este chequeo re-valida contra la lista actualmente
 * cargada antes de persistir.
 */
export function esDepositoVentaValido(
  depositoId: string,
  depositosPermitidos: { id: string }[]
): boolean {
  if (!depositoId) return false
  return depositosPermitidos.some((d) => d.id === depositoId)
}
