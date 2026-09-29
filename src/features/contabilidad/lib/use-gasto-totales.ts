import { useMemo } from 'react'
import {
  calcIvaFactura,
  calcMontoContableUsd,
  calcMontoProveedorUsd,
  calcTotalFactura,
  type MonedaFacturaGasto,
  type TipoImpuestoGasto,
} from './gasto-totales'

/**
 * Wrapper `useMemo` sobre `gasto-totales.ts` — extraido 1:1 de la seccion
 * "Funciones de conversion de abonos" de `gasto-form.tsx` (antes L505-553:
 * `abonoPagoProveedorUsd`/`abonoPagoInternoUsd`/saldos/`pagosSuperanTotal`),
 * que quedo FUERA del alcance de W2a (esa extraccion se limito a las 4
 * funciones puras de `gasto-totales.ts` — ver tasks.md 2a.1-2a.2 deviation
 * notes). Consumido por `paso-monto.tsx`/`paso-pagos.tsx`/`gasto-wizard.tsx`
 * (W2b); `gasto-form.tsx` NO se toca en este PR — mantiene su copia inline
 * de este mismo calculo (mismo output, misma aritmetica float nativa).
 */

export interface PagoTotalesInput {
  moneda: 'USD' | 'BS'
  monto: string
}

export interface UseGastoTotalesParams {
  monedaFactura: MonedaFacturaGasto
  usaTasaParalela: boolean
  tasaInterna: string
  tasaProveedor: string
  montoFactura: string
  tipoImpuesto: TipoImpuestoGasto
  porcentajeIva: string
  pagos: PagoTotalesInput[]
}

export interface UseGastoTotalesResult {
  ivaFactura: number
  totalFacturaNum: number
  montoContableUsd: number | null
  montoProveedorUsd: number | null
  abonoPagoProveedorUsd: (pago: PagoTotalesInput) => number
  abonoPagoInternoUsd: (pago: PagoTotalesInput) => number
  totalAbonadoProveedorUsd: number
  totalAbonadoInternoUsd: number
  saldoPendienteProveedor: number
  saldoPendienteInterno: number
  pagosSuperanTotal: boolean
}

export function useGastoTotales(params: UseGastoTotalesParams): UseGastoTotalesResult {
  const {
    monedaFactura,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    montoFactura,
    tipoImpuesto,
    porcentajeIva,
    pagos,
  } = params

  return useMemo(() => {
    const tasaInternaNum = parseFloat(tasaInterna) || 0
    const tasaProveedorNum = parseFloat(tasaProveedor) || 0
    const montoFacturaNum = parseFloat(montoFactura) || 0
    const porcentajeIvaNum = parseFloat(porcentajeIva) || 0

    const ivaFactura = calcIvaFactura(montoFacturaNum, porcentajeIvaNum, tipoImpuesto)
    const totalFacturaNum = calcTotalFactura(montoFacturaNum, ivaFactura)

    const montoContableUsd = calcMontoContableUsd({
      totalFacturaNum,
      monedaFactura,
      usaTasaParalela,
      tasaInternaNum,
      tasaProveedorNum,
    })

    const montoProveedorUsd = calcMontoProveedorUsd({
      totalFacturaNum,
      monedaFactura,
      usaTasaParalela,
      tasaInternaNum,
      tasaProveedorNum,
    })

    /** Perspectiva proveedor: BS/tasa_proveedor, USD as-is (para saldo_pendiente) */
    function abonoPagoProveedorUsd(pago: PagoTotalesInput): number {
      const val = parseFloat(pago.monto) || 0
      if (pago.moneda === 'USD') return val
      const tasaRef = usaTasaParalela && tasaProveedorNum > 0 ? tasaProveedorNum : tasaInternaNum
      return tasaRef > 0 ? val / tasaRef : 0
    }

    /** Perspectiva contable: BS/tasa_interna, USD as-is (para asientos) */
    function abonoPagoInternoUsd(pago: PagoTotalesInput): number {
      const val = parseFloat(pago.monto) || 0
      if (pago.moneda === 'USD') return val
      return tasaInternaNum > 0 ? val / tasaInternaNum : 0
    }

    const totalAbonadoProveedorUsd = pagos.reduce((s, p) => s + abonoPagoProveedorUsd(p), 0)
    const totalAbonadoInternoUsd = pagos.reduce((s, p) => s + abonoPagoInternoUsd(p), 0)

    const saldoPendienteProveedor =
      montoProveedorUsd !== null ? Math.max(0, montoProveedorUsd - totalAbonadoProveedorUsd) : 0
    const saldoPendienteInterno =
      montoContableUsd !== null ? Math.max(0, montoContableUsd - totalAbonadoInternoUsd) : 0

    const pagosSuperanTotal =
      montoProveedorUsd !== null &&
      montoProveedorUsd > 0 &&
      totalAbonadoProveedorUsd > montoProveedorUsd + 0.01

    return {
      ivaFactura,
      totalFacturaNum,
      montoContableUsd,
      montoProveedorUsd,
      abonoPagoProveedorUsd,
      abonoPagoInternoUsd,
      totalAbonadoProveedorUsd,
      totalAbonadoInternoUsd,
      saldoPendienteProveedor,
      saldoPendienteInterno,
      pagosSuperanTotal,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    monedaFactura,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    montoFactura,
    tipoImpuesto,
    porcentajeIva,
    pagos,
  ])
}
