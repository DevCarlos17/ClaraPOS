// Grilla unificada de conceptos fiscales — Card 1 "Resumen Fiscal".
//
// Construye la lista ORDENADA de filas alineadas por CONCEPTO (union de lo
// que existe en Ventas y en Devoluciones/NC), para que el componente pinte
// una unica grilla de 2 columnas donde cada fila tiene el valor de Ventas y
// el valor de Devoluciones lado a lado en la MISMA fila (en vez de dos listas
// independientes que podian desalinearse cuando las alicuotas no coincidian).
//
// Orden fijo: Subtotal (antes de impuestos) -> [Descuento/Sub total, solo si
// hayDescuento] -> Exento -> alicuotas IVA ascendente (Base+IVA por cada una,
// dinamico, N alicuotas reales) -> Total -> [IGTF, solo si aplica].
//
// Si un concepto no existe de un lado (ej. una alicuota presente solo en
// Ventas), ese lado queda en `null` — el componente lo pinta como celda vacia
// ("—"). Funcion PURA, sin dependencias de React/hooks — se testea sin mocks.
import type { IvaAlicuota } from '../hooks/use-cuadre'

export interface CeldaConcepto {
  label: string
  usd: number
  bs: number
  negativo?: boolean
  destacado?: boolean
}

export interface FilaConceptoAlineada {
  key: string
  ventas: CeldaConcepto | null
  devoluciones: CeldaConcepto | null
}

export interface BuildFilasAlineadasInput {
  // Ventas — calculo SIN cambios (ver engram sdd/nc-cuadre/subtotal-antes-impuestos)
  totalAntesImpuestosUsd: number
  totalAntesImpuestosBs: number
  hayDescuento: boolean
  totalDescuentoUsd: number
  totalDescuentoBs: number
  subTotalUsd: number
  subTotalBs: number
  totalExentoVentasUsd: number
  totalExentoVentasBs: number
  alicuotasVentas: IvaAlicuota[]
  totalVentasUsd: number
  totalVentasBs: number
  totalIgtfUsd: number
  totalIgtfBs: number

  // Devoluciones (Notas de Credito) — tasa HISTORICA, nunca recalculada
  hayDevoluciones: boolean
  ncSubtotalUsd: number
  ncSubtotalBs: number
  totalNcrExentoUsd: number
  totalNcrExentoBs: number
  alicuotasNc: IvaAlicuota[]
  totalNcrTotalUsd: number
  totalNcrTotalBs: number
}

/** Union ordenada ascendente de las alicuotas presentes en cualquiera de los
 * dos lados. Dinamico: N alicuotas reales, nunca una cantidad fija. */
export function buildAliquotUnion(ventas: IvaAlicuota[], devoluciones: IvaAlicuota[]): number[] {
  const set = new Set<number>()
  ventas.forEach((a) => set.add(a.impuestoPct))
  devoluciones.forEach((a) => set.add(a.impuestoPct))
  return Array.from(set).sort((a, b) => a - b)
}

const UMBRAL = 0.001

export function buildFilasAlineadas(input: BuildFilasAlineadasInput): FilaConceptoAlineada[] {
  const filas: FilaConceptoAlineada[] = []

  filas.push({
    key: 'subtotal',
    ventas: {
      label: 'Subtotal (antes de impuestos)',
      usd: input.totalAntesImpuestosUsd,
      bs: input.totalAntesImpuestosBs,
    },
    devoluciones: input.hayDevoluciones
      ? { label: 'Subtotal (antes de impuestos)', usd: input.ncSubtotalUsd, bs: input.ncSubtotalBs, negativo: true }
      : null,
  })

  if (input.hayDescuento) {
    filas.push({
      key: 'descuento',
      ventas: { label: 'Descuentos comerciales', usd: input.totalDescuentoUsd, bs: input.totalDescuentoBs, negativo: true },
      devoluciones: null,
    })
    filas.push({
      key: 'subtotal-neto',
      ventas: { label: 'Sub total', usd: input.subTotalUsd, bs: input.subTotalBs, destacado: true },
      devoluciones: null,
    })
  }

  const hayExentoVentas = input.totalExentoVentasUsd > UMBRAL
  const hayExentoNc = input.hayDevoluciones && input.totalNcrExentoUsd > UMBRAL
  if (hayExentoVentas || hayExentoNc) {
    filas.push({
      key: 'exento',
      ventas: hayExentoVentas ? { label: 'Exento', usd: input.totalExentoVentasUsd, bs: input.totalExentoVentasBs } : null,
      devoluciones: hayExentoNc ? { label: 'Exento', usd: input.totalNcrExentoUsd, bs: input.totalNcrExentoBs, negativo: true } : null,
    })
  }

  const ventasPorPct = new Map(input.alicuotasVentas.map((a) => [a.impuestoPct, a]))
  const ncPorPct = new Map(input.alicuotasNc.map((a) => [a.impuestoPct, a]))
  const union = buildAliquotUnion(input.alicuotasVentas, input.hayDevoluciones ? input.alicuotasNc : [])

  for (const pct of union) {
    const v = ventasPorPct.get(pct)
    const nc = input.hayDevoluciones ? ncPorPct.get(pct) : undefined

    filas.push({
      key: `base-${pct}`,
      ventas: v ? { label: `Base imponible ${pct}%`, usd: v.baseUsd, bs: v.baseBs } : null,
      devoluciones: nc ? { label: `Base imponible ${pct}%`, usd: nc.baseUsd, bs: nc.baseBs, negativo: true } : null,
    })
    filas.push({
      key: `iva-${pct}`,
      ventas: v ? { label: `IVA ${pct}%`, usd: v.montoIvaUsd, bs: v.montoIvaBs } : null,
      devoluciones: nc ? { label: `IVA ${pct}%`, usd: nc.montoIvaUsd, bs: nc.montoIvaBs, negativo: true } : null,
    })
  }

  filas.push({
    key: 'total',
    ventas: { label: 'Total facturado', usd: input.totalVentasUsd, bs: input.totalVentasBs, destacado: true },
    devoluciones: input.hayDevoluciones
      ? { label: 'Total Notas de Crédito', usd: input.totalNcrTotalUsd, bs: input.totalNcrTotalBs, negativo: true, destacado: true }
      : null,
  })

  if (input.totalIgtfUsd > UMBRAL) {
    filas.push({
      key: 'igtf',
      ventas: { label: 'IGTF', usd: input.totalIgtfUsd, bs: input.totalIgtfBs },
      devoluciones: null,
    })
    filas.push({
      key: 'total-igtf',
      ventas: {
        label: 'Total General (c/IGTF)',
        usd: input.totalVentasUsd + input.totalIgtfUsd,
        bs: input.totalVentasBs + input.totalIgtfBs,
        destacado: true,
      },
      devoluciones: null,
    })
  }

  return filas
}
