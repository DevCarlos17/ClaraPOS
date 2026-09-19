// `buildFilasAlineadas` — funcion pura que construye la grilla unificada de
// conceptos fiscales (Card 1 "Resumen Fiscal") alineando el valor de Ventas y
// el valor de Devoluciones (NC) EN LA MISMA fila, por concepto. Orden fijo:
// Subtotal (antes de impuestos) -> Exento -> alicuotas IVA ascendente -> Total.
// El union de alicuotas es dinamico (N alicuotas, no 4 filas fijas). Si un
// concepto solo existe de un lado, el otro lado queda en null (celda vacia,
// se renderiza como "—" en el componente). Cero mocks — logica pura.
import { buildFilasAlineadas, buildAliquotUnion, type BuildFilasAlineadasInput } from '../cuadre-totales-fiscales-model'

function baseInput(overrides: Partial<BuildFilasAlineadasInput> = {}): BuildFilasAlineadasInput {
  return {
    totalAntesImpuestosUsd: 232, totalAntesImpuestosBs: 9744,
    hayDescuento: false,
    totalDescuentoUsd: 0, totalDescuentoBs: 0,
    subTotalUsd: 232, subTotalBs: 9744,
    totalExentoVentasUsd: 0, totalExentoVentasBs: 0,
    alicuotasVentas: [{ impuestoPct: 16, baseUsd: 200, baseBs: 8400, montoIvaUsd: 32, montoIvaBs: 1344 }],
    totalVentasUsd: 232, totalVentasBs: 9744,
    totalIgtfUsd: 0, totalIgtfBs: 0,

    hayDevoluciones: false,
    ncSubtotalUsd: 0, ncSubtotalBs: 0,
    totalNcrExentoUsd: 0, totalNcrExentoBs: 0,
    alicuotasNc: [],
    totalNcrTotalUsd: 0, totalNcrTotalBs: 0,
    ...overrides,
  }
}

describe('buildAliquotUnion — union ordenada ascendente de alicuotas', () => {
  it('ordena ascendente el union de dos arreglos con alicuotas distintas', () => {
    const ventas = [{ impuestoPct: 16, baseUsd: 0, baseBs: 0, montoIvaUsd: 0, montoIvaBs: 0 }]
    const nc = [{ impuestoPct: 8, baseUsd: 0, baseBs: 0, montoIvaUsd: 0, montoIvaBs: 0 }]
    expect(buildAliquotUnion(ventas, nc)).toEqual([8, 16])
  })

  it('deduplica alicuotas repetidas en ambos lados', () => {
    const ventas = [{ impuestoPct: 16, baseUsd: 0, baseBs: 0, montoIvaUsd: 0, montoIvaBs: 0 }]
    const nc = [{ impuestoPct: 16, baseUsd: 0, baseBs: 0, montoIvaUsd: 0, montoIvaBs: 0 }]
    expect(buildAliquotUnion(ventas, nc)).toEqual([16])
  })

  it('triangulacion: tres alicuotas simultaneas (8, 16, 31) — prueba que NO esta limitado a 2', () => {
    const ventas = [
      { impuestoPct: 31, baseUsd: 0, baseBs: 0, montoIvaUsd: 0, montoIvaBs: 0 },
      { impuestoPct: 8, baseUsd: 0, baseBs: 0, montoIvaUsd: 0, montoIvaBs: 0 },
    ]
    const nc = [{ impuestoPct: 16, baseUsd: 0, baseBs: 0, montoIvaUsd: 0, montoIvaBs: 0 }]
    expect(buildAliquotUnion(ventas, nc)).toEqual([8, 16, 31])
  })
})

describe('buildFilasAlineadas — grilla unificada de conceptos (nc-cuadre-sesion, Card 1)', () => {
  it('fila subtotal: ambos lados presentes cuando hay devoluciones, Devoluciones = ncBase+ncExento (nuevo campo)', () => {
    const filas = buildFilasAlineadas(baseInput({
      hayDevoluciones: true,
      ncSubtotalUsd: 130, ncSubtotalBs: 5460,
    }))

    const subtotal = filas.find((f) => f.key === 'subtotal')
    expect(subtotal?.ventas).toEqual({ label: 'Subtotal (antes de impuestos)', usd: 232, bs: 9744 })
    expect(subtotal?.devoluciones).toEqual({ label: 'Subtotal (antes de impuestos)', usd: 130, bs: 5460, negativo: true })
  })

  it('fila subtotal: Devoluciones es null (celda vacia) cuando no hay devoluciones en la sesion', () => {
    const filas = buildFilasAlineadas(baseInput({ hayDevoluciones: false }))

    const subtotal = filas.find((f) => f.key === 'subtotal')
    expect(subtotal?.ventas).not.toBeNull()
    expect(subtotal?.devoluciones).toBeNull()
  })

  it('orden completo: subtotal -> exento -> alicuotas ascendente (base+iva por cada una) -> total', () => {
    const filas = buildFilasAlineadas(baseInput({
      totalExentoVentasUsd: 50, totalExentoVentasBs: 2100,
      alicuotasVentas: [
        { impuestoPct: 16, baseUsd: 200, baseBs: 8400, montoIvaUsd: 32, montoIvaBs: 1344 },
        { impuestoPct: 8, baseUsd: 100, baseBs: 4200, montoIvaUsd: 8, montoIvaBs: 336 },
      ],
    }))

    const keys = filas.map((f) => f.key)
    expect(keys).toEqual(['subtotal', 'exento', 'base-8', 'iva-8', 'base-16', 'iva-16', 'total'])
  })

  it('una alicuota presente SOLO en Ventas deja la celda de Devoluciones vacia (null)', () => {
    const filas = buildFilasAlineadas(baseInput({
      alicuotasVentas: [
        { impuestoPct: 16, baseUsd: 200, baseBs: 8400, montoIvaUsd: 32, montoIvaBs: 1344 },
        { impuestoPct: 8, baseUsd: 100, baseBs: 4200, montoIvaUsd: 8, montoIvaBs: 336 },
      ],
      hayDevoluciones: true,
      alicuotasNc: [{ impuestoPct: 16, baseUsd: 20, baseBs: 840, montoIvaUsd: 3.2, montoIvaBs: 134.4 }],
    }))

    const base8 = filas.find((f) => f.key === 'base-8')
    const iva8 = filas.find((f) => f.key === 'iva-8')
    const base16 = filas.find((f) => f.key === 'base-16')

    expect(base8?.ventas).toEqual({ label: 'Base imponible 8%', usd: 100, bs: 4200 })
    expect(base8?.devoluciones).toBeNull()
    expect(iva8?.devoluciones).toBeNull()
    expect(base16?.devoluciones).toEqual({ label: 'Base imponible 16%', usd: 20, bs: 840, negativo: true })
  })

  it('una alicuota presente SOLO en Devoluciones deja la celda de Ventas vacia (null)', () => {
    const filas = buildFilasAlineadas(baseInput({
      alicuotasVentas: [{ impuestoPct: 16, baseUsd: 200, baseBs: 8400, montoIvaUsd: 32, montoIvaBs: 1344 }],
      hayDevoluciones: true,
      alicuotasNc: [
        { impuestoPct: 16, baseUsd: 20, baseBs: 840, montoIvaUsd: 3.2, montoIvaBs: 134.4 },
        { impuestoPct: 8, baseUsd: 10, baseBs: 420, montoIvaUsd: 0.8, montoIvaBs: 33.6 },
      ],
    }))

    const base8 = filas.find((f) => f.key === 'base-8')
    expect(base8?.ventas).toBeNull()
    expect(base8?.devoluciones).toEqual({ label: 'Base imponible 8%', usd: 10, bs: 420, negativo: true })
  })

  it('fila exento: aparece si CUALQUIERA de los dos lados tiene monto > 0, con celda vacia del lado sin exento', () => {
    const filas = buildFilasAlineadas(baseInput({
      totalExentoVentasUsd: 0, totalExentoVentasBs: 0,
      hayDevoluciones: true,
      totalNcrExentoUsd: 50, totalNcrExentoBs: 2100,
    }))

    const exento = filas.find((f) => f.key === 'exento')
    expect(exento).toBeDefined()
    expect(exento?.ventas).toBeNull()
    expect(exento?.devoluciones).toEqual({ label: 'Exento', usd: 50, bs: 2100, negativo: true })
  })

  it('fila exento: NO aparece si ningun lado tiene monto exento > 0', () => {
    const filas = buildFilasAlineadas(baseInput({
      totalExentoVentasUsd: 0,
      hayDevoluciones: true,
      totalNcrExentoUsd: 0,
    }))

    expect(filas.find((f) => f.key === 'exento')).toBeUndefined()
  })

  it('fila total: labels distintos por lado (Total facturado vs Total Notas de Credito)', () => {
    const filas = buildFilasAlineadas(baseInput({
      hayDevoluciones: true,
      totalNcrTotalUsd: 116, totalNcrTotalBs: 4872,
    }))

    const total = filas.find((f) => f.key === 'total')
    expect(total?.ventas).toEqual({ label: 'Total facturado', usd: 232, bs: 9744, destacado: true })
    expect(total?.devoluciones).toEqual({ label: 'Total Notas de Crédito', usd: 116, bs: 4872, negativo: true, destacado: true })
  })

  it('fila total: Devoluciones es null cuando no hay devoluciones', () => {
    const filas = buildFilasAlineadas(baseInput({ hayDevoluciones: false }))
    const total = filas.find((f) => f.key === 'total')
    expect(total?.devoluciones).toBeNull()
  })

  it('descuento comercial: agrega filas descuento y subtotal-neto SOLO en Ventas, solo cuando hayDescuento=true', () => {
    const filas = buildFilasAlineadas(baseInput({
      hayDescuento: true,
      totalDescuentoUsd: 20, totalDescuentoBs: 840,
      subTotalUsd: 212, subTotalBs: 8904,
    }))

    const descuento = filas.find((f) => f.key === 'descuento')
    const subtotalNeto = filas.find((f) => f.key === 'subtotal-neto')

    expect(descuento?.ventas).toEqual({ label: 'Descuentos comerciales', usd: 20, bs: 840, negativo: true })
    expect(descuento?.devoluciones).toBeNull()
    expect(subtotalNeto?.ventas).toEqual({ label: 'Sub total', usd: 212, bs: 8904, destacado: true })
    expect(subtotalNeto?.devoluciones).toBeNull()
  })

  it('sin descuento: NO agrega filas descuento ni subtotal-neto', () => {
    const filas = buildFilasAlineadas(baseInput({ hayDescuento: false }))
    expect(filas.find((f) => f.key === 'descuento')).toBeUndefined()
    expect(filas.find((f) => f.key === 'subtotal-neto')).toBeUndefined()
  })

  it('IGTF: agrega filas igtf y total-igtf SOLO en Ventas cuando totalIgtfUsd > 0', () => {
    const filas = buildFilasAlineadas(baseInput({
      totalIgtfUsd: 7, totalIgtfBs: 294,
      totalVentasUsd: 232, totalVentasBs: 9744,
    }))

    const igtf = filas.find((f) => f.key === 'igtf')
    const totalIgtf = filas.find((f) => f.key === 'total-igtf')

    expect(igtf?.ventas).toEqual({ label: 'IGTF', usd: 7, bs: 294 })
    expect(igtf?.devoluciones).toBeNull()
    expect(totalIgtf?.ventas).toEqual({ label: 'Total General (c/IGTF)', usd: 239, bs: 10038, destacado: true })
  })

  it('sin IGTF: NO agrega filas igtf ni total-igtf', () => {
    const filas = buildFilasAlineadas(baseInput({ totalIgtfUsd: 0 }))
    expect(filas.find((f) => f.key === 'igtf')).toBeUndefined()
    expect(filas.find((f) => f.key === 'total-igtf')).toBeUndefined()
  })
})
