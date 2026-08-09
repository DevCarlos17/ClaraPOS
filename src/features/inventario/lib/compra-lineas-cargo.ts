/**
 * Consolidacion pura de lineas de cargo no-producto (Material de Empaque / Flete)
 * dentro del formulario de Factura de Compra.
 *
 * Motivo: estas lineas se suman al total de la factura (junto con las lineas de
 * producto) y, al procesar, se consolidan por concepto hacia registros `gastos`
 * separados. Estas funciones son puras (sin I/O) para que `compra-form.tsx`
 * (preview de totales) y `use-compras.ts` (persistencia dentro de crearCompra)
 * usen exactamente la misma logica y no diverjan.
 *
 * Ver openspec/changes/compra-empaque-flete/design.md — seccion "Interfaces / Contracts".
 */

import Decimal from 'decimal.js'

export type ConceptoCargo = 'EMPAQUE' | 'FLETE'

/**
 * Linea de cargo ya normalizada a USD (mismo criterio que `costo_unitario_usd`
 * en `LineaCompra`: la conversion desde la moneda seleccionada del formulario
 * ocurre ANTES de construir este objeto, nunca dentro de estas funciones).
 */
export interface LineaCargoUI {
  id: string
  concepto: ConceptoCargo
  monto: number
  porcentaje_iva: 0 | 16
}

export interface TotalLineasCargo {
  exentoUsd: number
  baseUsd: number
  ivaUsd: number
}

export interface ConsolidadoLineaCargo {
  concepto: ConceptoCargo
  baseUsd: number
  ivaUsd: number
  totalUsd: number
}

/** Orden de presentacion/consolidacion estable: EMPAQUE siempre antes que FLETE. */
const ORDEN_CONCEPTOS: ConceptoCargo[] = ['EMPAQUE', 'FLETE']

/** Calcula base e IVA (ambos en Decimal) de UNA linea de cargo. */
function calcularLineaCargo(linea: LineaCargoUI): { base: Decimal; iva: Decimal } {
  const base = new Decimal(linea.monto)
  const iva = linea.porcentaje_iva > 0 ? base.times(linea.porcentaje_iva).dividedBy(100) : new Decimal(0)
  return { base, iva }
}

/**
 * Suma todas las lineas de cargo (sin distinguir concepto) en los mismos
 * buckets fiscales que el loop de lineas de producto en `crearCompra`
 * (`totalExentoUsd` / `totalBaseUsd` / `totalIvaUsd`): IVA 0% cae en el
 * bucket exento, IVA 16% cae en base+iva gravable.
 */
export function totalizarLineasCargo(lineas: LineaCargoUI[]): TotalLineasCargo {
  let exentoUsd = new Decimal(0)
  let baseUsd = new Decimal(0)
  let ivaUsd = new Decimal(0)

  for (const linea of lineas) {
    const { base, iva } = calcularLineaCargo(linea)
    if (linea.porcentaje_iva === 0) {
      exentoUsd = exentoUsd.plus(base)
    } else {
      baseUsd = baseUsd.plus(base)
      ivaUsd = ivaUsd.plus(iva)
    }
  }

  return {
    exentoUsd: exentoUsd.toNumber(),
    baseUsd: baseUsd.toNumber(),
    ivaUsd: ivaUsd.toNumber(),
  }
}

/**
 * Agrupa las lineas de cargo POR CONCEPTO (EMPAQUE / FLETE) hacia exactamente
 * un grupo consolidado por concepto presente. A diferencia de `totalizarLineasCargo`,
 * aqui la BASE de un grupo suma TODAS sus lineas sin importar la alicuota — el
 * IVA mixto (0% + 16%) dentro del mismo concepto se suma por separado, tal como
 * exige el negocio: "1 gasto FLETE con base $30 e IVA $3.20" para $10 IVA0% + $20 IVA16%.
 *
 * Solo los conceptos con >=1 linea aparecen en el resultado.
 */
export function consolidarLineasCargo(lineas: LineaCargoUI[]): ConsolidadoLineaCargo[] {
  const grupos = new Map<ConceptoCargo, { base: Decimal; iva: Decimal }>()

  for (const linea of lineas) {
    const { base, iva } = calcularLineaCargo(linea)
    const existing = grupos.get(linea.concepto) ?? { base: new Decimal(0), iva: new Decimal(0) }
    grupos.set(linea.concepto, {
      base: existing.base.plus(base),
      iva: existing.iva.plus(iva),
    })
  }

  return ORDEN_CONCEPTOS.filter((c) => grupos.has(c)).map((concepto) => {
    const g = grupos.get(concepto)!
    return {
      concepto,
      baseUsd: g.base.toNumber(),
      ivaUsd: g.iva.toNumber(),
      totalUsd: g.base.plus(g.iva).toNumber(),
    }
  })
}
