/**
 * Calculo fiscal puro del formulario de Compra — extraido 1:1 de
 * `compra-form.tsx` (bloque `getLineSubtotal`/`desgloseUsd`/`totalUsd`/
 * `totalUsdSistema`/`pendienteUsd`/`convertirLineasCargoAUsd`, antes lineas
 * 443-582 y 690-700).
 *
 * IMPORTANTE: a diferencia de `gasto-totales.ts` (que es aritmetica flotante
 * nativa), este bloque de `compra-form.tsx` SI usa `decimal.js` en todas sus
 * expresiones (verificado via grep antes de extraer — zero asunciones). Estas
 * funciones replican exactamente ese uso de Decimal.js (mismo orden de
 * operaciones, mismos `.toDecimalPlaces()`/`.toNumber()`) para garantizar
 * salida byte-identica al refactorizar el formulario de escritorio.
 *
 * Reutiliza `DesgloseFiscalUsd`/`LineaCargoUI`/`ConceptoCargo` de
 * `compra-lineas-cargo.ts` (modulo hermano ya existente) en vez de redefinir
 * shapes equivalentes.
 *
 * DEVIACION vs el contrato originalmente sugerido: `calcTotalUsdSistema` NO
 * recibe cargos — el codigo real de `compra-form.tsx` (L562-568) calcula el
 * costo de inventario/contabilidad SOLO sobre `totalDisplay` (subtotal de
 * lineas de producto, sin IVA, sin cargos de empaque/flete); los cargos NO
 * participan en `totalUsdSistema`. `calcTotalUsd` y `calcTotalUsdSistema`
 * toman valores ya agregados (`totalConIvaDisplay`, `totalCargoUsd`,
 * `totalDisplay`, `totalUsd`) en vez de recibir `lineas`/`cargos` crudos,
 * porque `compra-form.tsx` necesita esos mismos totales intermedios para
 * calcular `totalBs`/`pendienteBs` (fuera del alcance de este batch) sin
 * duplicar el calculo — ver Task 3 del apply de W3a.
 */

import Decimal from 'decimal.js'
import { type ConceptoCargo, type LineaCargoUI, type DesgloseFiscalUsd } from './compra-lineas-cargo'

export type MonedaCompra = 'USD' | 'BS'
export type TipoImpuestoLinea = 'Gravable' | 'Exento' | 'Exonerado'

/** Subconjunto de `LineaUI` (compra-form.tsx) necesario para los calculos fiscales. */
export interface LineaCompraCalculoInput {
  cantidad_input: number
  costo_input: number
  tipo_impuesto: TipoImpuestoLinea
  impuesto_pct: number
}

/** Subconjunto de `LineaCargoInputUI` (compra-form.tsx) necesario para la conversion a USD. */
export interface LineaCargoInputCalculo {
  id: string
  concepto: ConceptoCargo
  monto_input: string
  porcentaje_iva: 0 | 16
}

/** Subconjunto de `PagoUI` (compra-form.tsx) necesario para calcular el pendiente. */
export interface PagoCompraCalculoInput {
  moneda: MonedaCompra
  monto: number
}

/** Subtotal (cantidad * costo) de una linea, en la moneda de visualizacion del formulario. 1:1 de L443-445. */
export function getLineSubtotal(l: LineaCompraCalculoInput): number {
  return new Decimal(l.cantidad_input).times(l.costo_input).toNumber()
}

/**
 * Desglose fiscal en USD agrupado por alicuota de IVA. 1:1 de `compra-form.tsx`
 * L474-515 (`desgloseUsd` useMemo).
 */
export function calcDesgloseUsd(
  lineas: LineaCompraCalculoInput[],
  moneda: MonedaCompra,
  tasaFacturaNum: number
): DesgloseFiscalUsd {
  let exento = new Decimal(0)
  const gravableMap = new Map<number, { base: Decimal; iva: Decimal }>()

  for (const l of lineas) {
    const lineaSub = new Decimal(getLineSubtotal(l))
    const subtotalUsd = moneda === 'USD'
      ? lineaSub
      : (tasaFacturaNum > 0 ? lineaSub.dividedBy(tasaFacturaNum) : new Decimal(0))

    if (l.tipo_impuesto !== 'Gravable') {
      exento = exento.plus(subtotalUsd)
    } else {
      const existing = gravableMap.get(l.impuesto_pct) ?? { base: new Decimal(0), iva: new Decimal(0) }
      const ivaAmount = subtotalUsd.times(l.impuesto_pct).dividedBy(100)
      gravableMap.set(l.impuesto_pct, {
        base: existing.base.plus(subtotalUsd),
        iva: existing.iva.plus(ivaAmount),
      })
    }
  }

  const gravableGroups = Array.from(gravableMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([pct, { base, iva }]) => ({
      pct,
      base: base.toDecimalPlaces(8).toNumber(),
      iva: iva.toDecimalPlaces(8).toNumber(),
    }))

  const totalIvaUsd = gravableGroups.reduce(
    (sum, g) => new Decimal(sum).plus(g.iva).toNumber(),
    0
  )

  return {
    exentoUsd: exento.toDecimalPlaces(8).toNumber(),
    gravableGroups,
    totalIvaUsd,
  }
}

/**
 * Convierte lineas de cargo (Material de Empaque / Flete) de la moneda display a
 * USD. 1:1 de `compra-form.tsx` L690-700 (`convertirLineasCargoAUsd`). Lineas
 * con monto invalido/vacio se excluyen del preview.
 */
export function convertirLineasCargo(
  cargos: LineaCargoInputCalculo[],
  moneda: MonedaCompra,
  tasaFacturaNum: number
): LineaCargoUI[] {
  return cargos
    .filter((l) => l.monto_input.trim() !== '' && parseFloat(l.monto_input) > 0)
    .map((l) => {
      const montoDisplay = parseFloat(l.monto_input)
      const montoUsd = moneda === 'USD'
        ? montoDisplay
        : (tasaFacturaNum > 0 ? new Decimal(montoDisplay).dividedBy(tasaFacturaNum).toNumber() : 0)
      return { id: l.id, concepto: l.concepto, monto: montoUsd, porcentaje_iva: l.porcentaje_iva }
    })
}

/**
 * totalUsd: siempre a tasa del proveedor (para CxP), incluye IVA + cargos
 * (empaque/flete). 1:1 de `compra-form.tsx` L552-555.
 *
 * `totalConIvaDisplay` = subtotal de lineas + IVA, en la moneda de
 * visualizacion del formulario. `totalCargoUsd` = suma de cargos ya
 * convertidos a USD (via `convertirLineasCargo` + `totalizarLineasCargo` de
 * `compra-lineas-cargo.ts`).
 */
export function calcTotalUsd(
  totalConIvaDisplay: number,
  totalCargoUsd: number,
  moneda: MonedaCompra,
  tasaFacturaNum: number
): number {
  return (moneda === 'USD'
    ? new Decimal(totalConIvaDisplay)
    : (tasaFacturaNum > 0 ? new Decimal(totalConIvaDisplay).dividedBy(tasaFacturaNum) : new Decimal(0))
  ).plus(totalCargoUsd).toNumber()
}

/**
 * totalUsdSistema: a tasa interna (para inventario y contabilidad, SIN IVA,
 * SIN cargos de empaque/flete). 1:1 de `compra-form.tsx` L562-568.
 *
 * `totalDisplay` = subtotal de lineas de producto (sin IVA), en la moneda de
 * visualizacion. `totalUsd` = valor ya calculado por `calcTotalUsd` — se usa
 * como passthrough cuando no aplica tasa paralela.
 */
export function calcTotalUsdSistema(
  totalDisplay: number,
  totalUsd: number,
  moneda: MonedaCompra,
  tasaFacturaNum: number,
  tasaInternaNum: number,
  usaTasaParalela: boolean
): number {
  return usaTasaParalela && tasaInternaNum > 0
    ? (moneda === 'USD'
        ? (tasaFacturaNum > 0
            ? new Decimal(totalDisplay).times(tasaFacturaNum).dividedBy(tasaInternaNum).toNumber()
            : 0)
        : new Decimal(totalDisplay).dividedBy(tasaInternaNum).toNumber())
    : totalUsd
}

/**
 * pendienteUsd: saldo restante en USD (a tasa proveedor), nunca negativo,
 * redondeado a 2 decimales. 1:1 de `compra-form.tsx` L571-582
 * (`totalAbonadoUsd` + `pendienteUsd`).
 */
export function calcPendienteUsd(
  totalUsd: number,
  pagos: PagoCompraCalculoInput[],
  tasaFacturaNum: number
): number {
  const totalAbonadoUsd = pagos.reduce((sum, p) => {
    const mUsd = p.moneda === 'BS'
      ? (tasaFacturaNum > 0 ? new Decimal(p.monto).dividedBy(tasaFacturaNum).toNumber() : 0)
      : p.monto
    return new Decimal(sum).plus(mUsd).toNumber()
  }, 0)
  return Math.max(0, new Decimal(totalUsd).minus(totalAbonadoUsd).toDecimalPlaces(2).toNumber())
}
