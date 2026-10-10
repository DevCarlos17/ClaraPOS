// =============================================
// hayFormaDeCobroValida
// =============================================

/**
 * Determina si existe al menos UNA via de pago valida para habilitar el boton de
 * envio en los modales de cobro CxC (`PagoFacturaModal`, `AbonoGlobalModal`):
 *
 * - SAF-only: `usarSaf` marcado CON `montoSafNum > 0` — valido POR SI SOLO, sin
 *   requerir metodo de cobro ni monto normal (bug previo: el gate exigia que el
 *   SAF cubriera el 100% del saldo via `safCubreTodo`, bloqueando aplicaciones
 *   parciales de SAF sin efectivo acompanante).
 * - Abono normal: metodo de cobro seleccionado CON `montoNum > 0` — valido POR SI
 *   SOLO, comportamiento historico sin cambios.
 * - Ambos presentes (SAF + abono normal): valido (OR, no XOR).
 *
 * NO incluye el resto de las condiciones del gate completo (tasa > 0, overpago
 * resuelto, destino de prestamo valido, "SAF marcado pero sin monto bloquea")
 * — cada modal combina este resultado con sus propios AND adicionales, ya que
 * difieren entre `PagoFacturaModal` (tiene destino FACTURA/PRESTAMO + overpago)
 * y `AbonoGlobalModal` (no tiene esos conceptos).
 *
 * Funcion pura — sin dependencias de React/DB, trivial de testear sin mocks.
 */
export function hayFormaDeCobroValida(
  usarSaf: boolean,
  montoSafNum: number,
  metodoSeleccionado: boolean,
  montoNum: number
): boolean {
  const safAplicable = usarSaf && montoSafNum > 0
  const metodoValido = metodoSeleccionado && montoNum > 0
  return safAplicable || metodoValido
}

// =============================================
// calcularTotalAplicado
// =============================================

/**
 * Total que el boton de envio debe mostrar: suma de lo que se cobra por metodo
 * normal (`montoUsd`, ya convertido a USD si el metodo es en Bs) MAS lo que se
 * aplica de SAF (`montoSafNum`, siempre USD). Si solo hay SAF, `montoUsd` es 0 y
 * el total es solo el SAF; si solo hay metodo normal, `montoSafNum` es 0 y el
 * total es solo el abono en efectivo — cubre los 3 casos del contrato del owner
 * (solo SAF / solo abono / mixto) con una sola suma, sin branching.
 */
export function calcularTotalAplicado(montoUsd: number, montoSafNum: number): number {
  return montoUsd + montoSafNum
}
