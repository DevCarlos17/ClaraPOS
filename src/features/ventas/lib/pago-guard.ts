export type PagoGuardResult =
  | { blocked: false }
  | { blocked: true; reason: 'ABONO_SIN_AGREGAR' | 'METODO_SIN_MONTO' }

export interface PagoGuardState {
  metodoId: string
  montoStr: string
  referencia: string
}

/**
 * Fix pos-cobro-checkout-guards (R5/R6): predicado puro que detecta un pago
 * a medio ingresar en el formulario de "Agregar pago" (metodo/monto/referencia)
 * que se perderia si el cajero procesa la venta o cambia de modo de
 * discrepancia sin presionar "+" primero. Funcion PURA: sin I/O.
 *
 * Prioridad: R5 (ABONO_SIN_AGREGAR) siempre gana sobre R6 (METODO_SIN_MONTO)
 * cuando ambas condiciones aplican — ver design.md contrato `PagoGuardResult`.
 */
export function evaluarPagoPendiente({ metodoId, montoStr, referencia }: PagoGuardState): PagoGuardResult {
  // R5: hay texto ingresado en monto o referencia que aun no se agrego con "+"
  if (montoStr.trim() !== '' || referencia.trim() !== '') {
    return { blocked: true, reason: 'ABONO_SIN_AGREGAR' }
  }
  // R6: se eligio un metodo de pago pero no se ingreso ningun monto
  if (metodoId.trim() !== '') {
    return { blocked: true, reason: 'METODO_SIN_MONTO' }
  }
  return { blocked: false }
}
