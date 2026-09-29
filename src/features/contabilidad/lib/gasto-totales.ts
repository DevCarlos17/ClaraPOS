/**
 * Calculo fiscal puro del formulario de Gasto — extraido 1:1 de
 * `gasto-form.tsx` (bloque "Calculo del monto contable USD" /
 * "Monto desde perspectiva proveedor", antes lineas 470-502).
 *
 * IMPORTANTE: el bloque original de `gasto-form.tsx` NO usa `decimal.js` —
 * es aritmetica de punto flotante nativa (`parseFloat` + `Number(...toFixed(2))`).
 * Estas funciones replican esa aritmetica EXACTAMENTE (mismo orden de
 * operaciones, mismo redondeo) para garantizar salida byte-identica al
 * refactorizar el formulario de escritorio. No introducir `decimal.js` aqui:
 * cualquier libreria de precision arbitraria puede redondear divisiones de
 * forma distinta al float nativo y romper la paridad exigida.
 *
 * Estos calculos son sobre el INGRESO de datos del formulario (montos aun no
 * persistidos). Para derivar totales de un registro `gastos` ya persistido,
 * ver `gasto-montos.ts` (modulo distinto, semantica distinta).
 */

export type MonedaFacturaGasto = 'USD' | 'BS'
export type TipoImpuestoGasto = 'Gravable' | 'Exento' | 'Exonerado'

/**
 * IVA de la factura. `montoFacturaNum` es la BASE (antes de IVA).
 * Solo aplica IVA si `tipoImpuesto === 'Gravable'`; redondeado a 2
 * decimales (regla fiscal venezolana: el IVA se redondea a nivel de factura).
 */
export function calcIvaFactura(
  montoFacturaNum: number,
  porcentajeIvaNum: number,
  tipoImpuesto: TipoImpuestoGasto
): number {
  return tipoImpuesto === 'Gravable'
    ? Number((montoFacturaNum * (porcentajeIvaNum / 100)).toFixed(2))
    : 0
}

/** Total de la factura = base + IVA, redondeado a 2 decimales. */
export function calcTotalFactura(montoFacturaNum: number, ivaFactura: number): number {
  return Number((montoFacturaNum + ivaFactura).toFixed(2))
}

export interface CalcMontoUsdParams {
  totalFacturaNum: number
  monedaFactura: MonedaFacturaGasto
  usaTasaParalela: boolean
  tasaInternaNum: number
  tasaProveedorNum: number
}

/**
 * Monto contable USD (tasa interna). `null` si el total o la tasa interna
 * no son positivos — el formulario usa `null` para bloquear el submit.
 */
export function calcMontoContableUsd(params: CalcMontoUsdParams): number | null {
  const { totalFacturaNum, monedaFactura, usaTasaParalela, tasaInternaNum, tasaProveedorNum } = params
  if (totalFacturaNum <= 0 || tasaInternaNum <= 0) return null
  if (monedaFactura === 'BS') {
    return totalFacturaNum / tasaInternaNum
  }
  if (usaTasaParalela && tasaProveedorNum > 0) {
    return (totalFacturaNum * tasaProveedorNum) / tasaInternaNum
  }
  return totalFacturaNum
}

/**
 * Monto desde la perspectiva del proveedor (tasa proveedor si aplica tasa
 * paralela, sino tasa interna). `null` si no hay total o no hay tasa de
 * referencia positiva.
 */
export function calcMontoProveedorUsd(params: CalcMontoUsdParams): number | null {
  const { totalFacturaNum, monedaFactura, usaTasaParalela, tasaInternaNum, tasaProveedorNum } = params
  if (totalFacturaNum <= 0) return null
  if (monedaFactura === 'USD') return totalFacturaNum
  const tasaRef = usaTasaParalela && tasaProveedorNum > 0 ? tasaProveedorNum : tasaInternaNum
  return tasaRef > 0 ? totalFacturaNum / tasaRef : null
}
