import Decimal from 'decimal.js'
import { totalizarLineasCargo } from '../compra-lineas-cargo'
import {
  getLineSubtotal,
  calcDesgloseUsd,
  convertirLineasCargo,
  calcTotalUsd,
  calcTotalUsdSistema,
  calcPendienteUsd,
  type LineaCompraCalculoInput,
  type LineaCargoInputCalculo,
  type PagoCompraCalculoInput,
} from '../compra-desglose'

// Fixtures y expectativas calculadas a mano reproduciendo EXACTAMENTE las
// expresiones de `compra-form.tsx` L443-582 (mismo orden de operaciones,
// mismo uso de Decimal.js) — no una reimplementacion independiente. El
// objetivo es garantizar salida byte-identica al refactorizar el formulario
// de escritorio para consumir este modulo.

function linea(overrides: Partial<LineaCompraCalculoInput> = {}): LineaCompraCalculoInput {
  return {
    cantidad_input: 1,
    costo_input: 0,
    tipo_impuesto: 'Exento',
    impuesto_pct: 0,
    ...overrides,
  }
}

function cargo(overrides: Partial<LineaCargoInputCalculo> = {}): LineaCargoInputCalculo {
  return {
    id: 'c1',
    concepto: 'EMPAQUE',
    monto_input: '',
    porcentaje_iva: 0,
    ...overrides,
  }
}

describe('getLineSubtotal', () => {
  it('cantidad * costo, redondeo Decimal', () => {
    expect(getLineSubtotal(linea({ cantidad_input: 2, costo_input: 50 }))).toBe(100)
  })

  it('cantidad con decimales no sufre drift de punto flotante', () => {
    // 0.1 * 3 en JS puro = 0.30000000000000004
    expect(getLineSubtotal(linea({ cantidad_input: 0.1, costo_input: 3 }))).toBe(0.3)
  })
})

describe('calcDesgloseUsd', () => {
  it('una sola linea Gravable, moneda USD: va al bucket gravable de su alicuota', () => {
    const result = calcDesgloseUsd([linea({ cantidad_input: 2, costo_input: 50, tipo_impuesto: 'Gravable', impuesto_pct: 16 })], 'USD', 0)
    expect(result).toEqual({
      exentoUsd: 0,
      gravableGroups: [{ pct: 16, base: 100, iva: 16 }],
      totalIvaUsd: 16,
    })
  })

  it('una sola linea Exento, moneda USD: va integra al bucket exento', () => {
    const result = calcDesgloseUsd([linea({ cantidad_input: 3, costo_input: 10, tipo_impuesto: 'Exento' })], 'USD', 0)
    expect(result).toEqual({ exentoUsd: 30, gravableGroups: [], totalIvaUsd: 0 })
  })

  it('multi-linea con alicuotas mixtas + Exonerado: Exonerado cae en exento (tipo !== Gravable)', () => {
    const result = calcDesgloseUsd(
      [
        linea({ cantidad_input: 1, costo_input: 100, tipo_impuesto: 'Gravable', impuesto_pct: 16 }),
        linea({ cantidad_input: 1, costo_input: 50, tipo_impuesto: 'Gravable', impuesto_pct: 8 }),
        linea({ cantidad_input: 1, costo_input: 20, tipo_impuesto: 'Exonerado' }),
      ],
      'USD',
      0
    )
    // gravableGroups ordenado ascendente por pct
    expect(result).toEqual({
      exentoUsd: 20,
      gravableGroups: [
        { pct: 8, base: 50, iva: 4 },
        { pct: 16, base: 100, iva: 16 },
      ],
      totalIvaUsd: 20,
    })
  })

  it('moneda BS: subtotal se divide por tasaFacturaNum antes de clasificar', () => {
    const result = calcDesgloseUsd(
      [linea({ cantidad_input: 1, costo_input: 1000, tipo_impuesto: 'Gravable', impuesto_pct: 16 })],
      'BS',
      100
    )
    expect(result).toEqual({
      exentoUsd: 0,
      gravableGroups: [{ pct: 16, base: 10, iva: 1.6 }],
      totalIvaUsd: 1.6,
    })
  })

  it('moneda BS con tasaFacturaNum <= 0: subtotal cae a 0 (guardia division por cero)', () => {
    const result = calcDesgloseUsd(
      [linea({ cantidad_input: 1, costo_input: 1000, tipo_impuesto: 'Exento' })],
      'BS',
      0
    )
    expect(result).toEqual({ exentoUsd: 0, gravableGroups: [], totalIvaUsd: 0 })
  })

  it('array vacio: retorna ceros', () => {
    expect(calcDesgloseUsd([], 'USD', 0)).toEqual({ exentoUsd: 0, gravableGroups: [], totalIvaUsd: 0 })
  })
})

describe('convertirLineasCargo', () => {
  it('moneda USD: monto_input pasa directo a monto (sin conversion)', () => {
    const result = convertirLineasCargo([cargo({ concepto: 'EMPAQUE', monto_input: '50', porcentaje_iva: 0 })], 'USD', 0)
    expect(result).toEqual([{ id: 'c1', concepto: 'EMPAQUE', monto: 50, porcentaje_iva: 0 }])
  })

  it('moneda BS: monto_input se divide por tasaFacturaNum', () => {
    const result = convertirLineasCargo([cargo({ concepto: 'FLETE', monto_input: '200', porcentaje_iva: 16 })], 'BS', 50)
    expect(result).toEqual([{ id: 'c1', concepto: 'FLETE', monto: 4, porcentaje_iva: 16 }])
  })

  it('moneda BS con tasaFacturaNum <= 0: monto cae a 0', () => {
    const result = convertirLineasCargo([cargo({ monto_input: '100' })], 'BS', 0)
    expect(result).toEqual([{ id: 'c1', concepto: 'EMPAQUE', monto: 0, porcentaje_iva: 0 }])
  })

  it('filtra lineas con monto_input vacio o <= 0', () => {
    const result = convertirLineasCargo(
      [
        cargo({ id: 'a', monto_input: '' }),
        cargo({ id: 'b', monto_input: '0' }),
        cargo({ id: 'c', monto_input: '-5' }),
        cargo({ id: 'd', monto_input: '10' }),
      ],
      'USD',
      0
    )
    expect(result).toEqual([{ id: 'd', concepto: 'EMPAQUE', monto: 10, porcentaje_iva: 0 }])
  })

  it('array vacio: retorna []', () => {
    expect(convertirLineasCargo([], 'USD', 0)).toEqual([])
  })
})

describe('calcTotalUsd', () => {
  it('moneda USD, sin cargo: retorna totalConIvaDisplay directo', () => {
    expect(calcTotalUsd(116, 0, 'USD', 40)).toBe(116)
  })

  it('moneda USD, con cargo: suma totalCargoUsd', () => {
    expect(calcTotalUsd(200, 25.5, 'USD', 40)).toBe(225.5)
  })

  it('moneda BS: divide totalConIvaDisplay por tasaFacturaNum, luego suma cargo (ya en USD)', () => {
    expect(calcTotalUsd(1160, 5, 'BS', 100)).toBe(16.6)
  })

  it('moneda BS con tasaFacturaNum <= 0: parte BS cae a 0, solo queda el cargo', () => {
    expect(calcTotalUsd(500, 10, 'BS', 0)).toBe(10)
  })
})

describe('calcTotalUsdSistema', () => {
  it('usaTasaParalela=false: pasa totalUsd directo (ignora totalDisplay)', () => {
    expect(calcTotalUsdSistema(999, 116, 'USD', 40, 36.5, false)).toBe(116)
  })

  it('usaTasaParalela=true, moneda USD: totalDisplay * tasaFacturaNum / tasaInternaNum', () => {
    const result = calcTotalUsdSistema(100, 100, 'USD', 40, 36.5, true)
    expect(result).toBe((100 * 40) / 36.5)
  })

  it('usaTasaParalela=true, moneda BS: totalDisplay / tasaInternaNum (tasaFacturaNum irrelevante)', () => {
    expect(calcTotalUsdSistema(1000, 999, 'BS', 999999, 50, true)).toBe(20)
  })

  it('usaTasaParalela=true pero tasaInternaNum <= 0: cae al passthrough de totalUsd', () => {
    expect(calcTotalUsdSistema(100, 77, 'USD', 40, 0, true)).toBe(77)
  })

  it('usaTasaParalela=true, moneda USD, tasaFacturaNum <= 0: retorna 0 (guardia division)', () => {
    expect(calcTotalUsdSistema(100, 77, 'USD', 0, 36.5, true)).toBe(0)
  })
})

describe('calcPendienteUsd', () => {
  it('sin pagos: pendiente = totalUsd completo', () => {
    expect(calcPendienteUsd(100, [], 0)).toBe(100)
  })

  it('pago en USD: se resta directo', () => {
    const pagos: PagoCompraCalculoInput[] = [{ moneda: 'USD', monto: 40 }]
    expect(calcPendienteUsd(100, pagos, 0)).toBe(60)
  })

  it('pago en BS: se convierte a USD via tasaFacturaNum antes de restar', () => {
    const pagos: PagoCompraCalculoInput[] = [{ moneda: 'BS', monto: 2000 }]
    expect(calcPendienteUsd(100, pagos, 50)).toBe(60)
  })

  it('pago en BS con tasaFacturaNum <= 0: abono cae a 0 (no se resta nada)', () => {
    const pagos: PagoCompraCalculoInput[] = [{ moneda: 'BS', monto: 2000 }]
    expect(calcPendienteUsd(100, pagos, 0)).toBe(100)
  })

  it('pagos superan el total: clamp a 0, nunca negativo', () => {
    const pagos: PagoCompraCalculoInput[] = [{ moneda: 'USD', monto: 80 }]
    expect(calcPendienteUsd(50, pagos, 0)).toBe(0)
  })

  it('redondea a 2 decimales', () => {
    const pagos: PagoCompraCalculoInput[] = [{ moneda: 'USD', monto: 33.333 }]
    expect(calcPendienteUsd(100.005, pagos, 0)).toBe(66.67)
  })

  it('multiples pagos mixtos USD+BS se acumulan', () => {
    const pagos: PagoCompraCalculoInput[] = [
      { moneda: 'USD', monto: 20 },
      { moneda: 'BS', monto: 1000 },
    ]
    // abonado = 20 + (1000/50=20) = 40
    expect(calcPendienteUsd(100, pagos, 50)).toBe(60)
  })
})

describe('flujo completo — paridad tasa paralela ON vs OFF (compra-form.tsx L552-568)', () => {
  it('dual-rate OFF: totalUsd y totalUsdSistema coinciden', () => {
    const lineas = [linea({ cantidad_input: 1, costo_input: 100, tipo_impuesto: 'Exento' })]
    const moneda = 'USD' as const
    const tasaFacturaNum = 36.5 // usaTasaParalela=false → tasaFacturaNum = tasaInternaNum
    const tasaInternaNum = 36.5
    const totalDisplay = lineas.reduce((s, l) => s + getLineSubtotal(l), 0)
    const desglose = calcDesgloseUsd(lineas, moneda, tasaFacturaNum)
    const totalConIvaDisplay = totalDisplay + desglose.totalIvaUsd
    const totalUsd = calcTotalUsd(totalConIvaDisplay, 0, moneda, tasaFacturaNum)
    const totalUsdSistema = calcTotalUsdSistema(totalDisplay, totalUsd, moneda, tasaFacturaNum, tasaInternaNum, false)
    expect(totalUsd).toBe(100)
    expect(totalUsdSistema).toBe(totalUsd)
  })

  it('dual-rate ON: totalUsd (tasa proveedor) y totalUsdSistema (tasa interna) divergen', () => {
    const lineas = [linea({ cantidad_input: 1, costo_input: 100, tipo_impuesto: 'Exento' })]
    const moneda = 'USD' as const
    const tasaProveedor = 40
    const tasaInterna = 36.5
    const totalDisplay = lineas.reduce((s, l) => s + getLineSubtotal(l), 0)
    const desglose = calcDesgloseUsd(lineas, moneda, tasaProveedor)
    const totalConIvaDisplay = totalDisplay + desglose.totalIvaUsd
    const totalUsd = calcTotalUsd(totalConIvaDisplay, 0, moneda, tasaProveedor)
    const totalUsdSistema = calcTotalUsdSistema(totalDisplay, totalUsd, moneda, tasaProveedor, tasaInterna, true)
    expect(totalUsd).toBe(100)
    expect(totalUsdSistema).toBe((100 * 40) / 36.5)
    expect(totalUsdSistema).not.toBe(totalUsd)
  })
})

describe('paridad byte-identica vs la formula ORIGINAL de compra-form.tsx (verificacion 3a.3)', () => {
  /**
   * Reproduce literalmente (copy-paste, sin pasar por el modulo) el bloque
   * completo `compra-form.tsx` L443-582 tal como existia ANTES del refactor
   * de W3a, para un escenario multi-linea + cargo + tasa paralela. Si esta
   * funcion y las funciones del modulo (llamadas abajo) no producen el mismo
   * resultado exacto, el refactor rompio la paridad de comportamiento.
   */
  function formulaOriginal(
    lineas: LineaCompraCalculoInput[],
    lineasCargo: LineaCargoInputCalculo[],
    pagos: PagoCompraCalculoInput[],
    moneda: 'USD' | 'BS',
    tasaFacturaNum: number,
    tasaInternaNum: number,
    usaTasaParalela: boolean
  ) {
    function getLineSubtotalOrig(l: LineaCompraCalculoInput): number {
      return new Decimal(l.cantidad_input).times(l.costo_input).toNumber()
    }

    const totalDisplay = lineas.reduce((sum, l) => new Decimal(sum).plus(getLineSubtotalOrig(l)).toNumber(), 0)

    let exento = new Decimal(0)
    const gravableMap = new Map<number, { base: Decimal; iva: Decimal }>()
    for (const l of lineas) {
      const lineaSub = new Decimal(getLineSubtotalOrig(l))
      const subtotalUsd = moneda === 'USD' ? lineaSub : (tasaFacturaNum > 0 ? lineaSub.dividedBy(tasaFacturaNum) : new Decimal(0))
      if (l.tipo_impuesto !== 'Gravable') {
        exento = exento.plus(subtotalUsd)
      } else {
        const existing = gravableMap.get(l.impuesto_pct) ?? { base: new Decimal(0), iva: new Decimal(0) }
        const ivaAmount = subtotalUsd.times(l.impuesto_pct).dividedBy(100)
        gravableMap.set(l.impuesto_pct, { base: existing.base.plus(subtotalUsd), iva: existing.iva.plus(ivaAmount) })
      }
    }
    const gravableGroups = Array.from(gravableMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([pct, { base, iva }]) => ({ pct, base: base.toDecimalPlaces(8).toNumber(), iva: iva.toDecimalPlaces(8).toNumber() }))
    const totalIvaUsd = gravableGroups.reduce((sum, g) => new Decimal(sum).plus(g.iva).toNumber(), 0)
    const desgloseUsd = { exentoUsd: exento.toDecimalPlaces(8).toNumber(), gravableGroups, totalIvaUsd }

    const totalIvaBs = lineas.reduce((sum, l) => {
      if (l.tipo_impuesto !== 'Gravable') return sum
      return new Decimal(sum).plus(new Decimal(getLineSubtotalOrig(l)).times(l.impuesto_pct).dividedBy(100)).toNumber()
    }, 0)
    const totalIvaDisplay = moneda === 'USD' ? totalIvaUsd : totalIvaBs
    const totalConIvaDisplay = new Decimal(totalDisplay).plus(totalIvaDisplay).toNumber()

    const lineasCargoUsd = lineasCargo
      .filter((l) => l.monto_input.trim() !== '' && parseFloat(l.monto_input) > 0)
      .map((l) => {
        const montoDisplay = parseFloat(l.monto_input)
        const montoUsd = moneda === 'USD' ? montoDisplay : (tasaFacturaNum > 0 ? new Decimal(montoDisplay).dividedBy(tasaFacturaNum).toNumber() : 0)
        return { id: l.id, concepto: l.concepto, monto: montoUsd, porcentaje_iva: l.porcentaje_iva }
      })
    const cargoTotales = totalizarLineasCargo(lineasCargoUsd)
    const totalCargoUsd = new Decimal(cargoTotales.exentoUsd).plus(cargoTotales.baseUsd).plus(cargoTotales.ivaUsd)

    const totalUsd = (moneda === 'USD'
      ? new Decimal(totalConIvaDisplay)
      : (tasaFacturaNum > 0 ? new Decimal(totalConIvaDisplay).dividedBy(tasaFacturaNum) : new Decimal(0))
    ).plus(totalCargoUsd).toNumber()

    const totalUsdSistema = usaTasaParalela && tasaInternaNum > 0
      ? (moneda === 'USD'
          ? (tasaFacturaNum > 0 ? new Decimal(totalDisplay).times(tasaFacturaNum).dividedBy(tasaInternaNum).toNumber() : 0)
          : new Decimal(totalDisplay).dividedBy(tasaInternaNum).toNumber())
      : totalUsd

    const totalAbonadoUsd = pagos.reduce((sum, p) => {
      const mUsd = p.moneda === 'BS' ? (tasaFacturaNum > 0 ? new Decimal(p.monto).dividedBy(tasaFacturaNum).toNumber() : 0) : p.monto
      return new Decimal(sum).plus(mUsd).toNumber()
    }, 0)
    const pendienteUsd = Math.max(0, new Decimal(totalUsd).minus(totalAbonadoUsd).toDecimalPlaces(2).toNumber())

    return { desgloseUsd, totalUsd, totalUsdSistema, pendienteUsd }
  }

  it('escenario complejo: 3 lineas mixtas + 2 cargos + 2 pagos mixtos + tasa paralela ON', () => {
    const lineas: LineaCompraCalculoInput[] = [
      { cantidad_input: 3, costo_input: 15.5, tipo_impuesto: 'Gravable', impuesto_pct: 16 },
      { cantidad_input: 1, costo_input: 200, tipo_impuesto: 'Gravable', impuesto_pct: 8 },
      { cantidad_input: 5, costo_input: 4.2, tipo_impuesto: 'Exento', impuesto_pct: 0 },
    ]
    const lineasCargo: LineaCargoInputCalculo[] = [
      { id: 'c1', concepto: 'EMPAQUE', monto_input: '12.75', porcentaje_iva: 16 },
      { id: 'c2', concepto: 'FLETE', monto_input: '30', porcentaje_iva: 0 },
    ]
    const pagos: PagoCompraCalculoInput[] = [
      { moneda: 'USD', monto: 50 },
      { moneda: 'BS', monto: 1500 },
    ]
    const moneda = 'USD' as const
    const tasaProveedor = 42.35
    const tasaInterna = 38.1
    const usaTasaParalela = true

    const original = formulaOriginal(lineas, lineasCargo, pagos, moneda, tasaProveedor, tasaInterna, usaTasaParalela)

    const totalDisplay = lineas.reduce((s, l) => new Decimal(s).plus(getLineSubtotal(l)).toNumber(), 0)
    const desgloseUsd = calcDesgloseUsd(lineas, moneda, tasaProveedor)
    const totalIvaBs = lineas.reduce((sum, l) => {
      if (l.tipo_impuesto !== 'Gravable') return sum
      return new Decimal(sum).plus(new Decimal(getLineSubtotal(l)).times(l.impuesto_pct).dividedBy(100)).toNumber()
    }, 0)
    const totalIvaDisplay = moneda === 'USD' ? desgloseUsd.totalIvaUsd : totalIvaBs
    const totalConIvaDisplay = new Decimal(totalDisplay).plus(totalIvaDisplay).toNumber()
    const lineasCargoUsd = convertirLineasCargo(lineasCargo, moneda, tasaProveedor)
    const cargoTotales = totalizarLineasCargo(lineasCargoUsd)
    const totalCargoUsd = new Decimal(cargoTotales.exentoUsd).plus(cargoTotales.baseUsd).plus(cargoTotales.ivaUsd)
    const totalUsd = calcTotalUsd(totalConIvaDisplay, totalCargoUsd.toNumber(), moneda, tasaProveedor)
    const totalUsdSistema = calcTotalUsdSistema(totalDisplay, totalUsd, moneda, tasaProveedor, tasaInterna, usaTasaParalela)
    const pendienteUsd = calcPendienteUsd(totalUsd, pagos, tasaProveedor)

    expect(desgloseUsd).toEqual(original.desgloseUsd)
    expect(totalUsd).toBe(original.totalUsd)
    expect(totalUsdSistema).toBe(original.totalUsdSistema)
    expect(pendienteUsd).toBe(original.pendienteUsd)
  })

  it('escenario complejo moneda BS: mismas lineas/cargos, sin tasa paralela', () => {
    const lineas: LineaCompraCalculoInput[] = [
      { cantidad_input: 2, costo_input: 850.5, tipo_impuesto: 'Gravable', impuesto_pct: 16 },
      { cantidad_input: 1, costo_input: 120, tipo_impuesto: 'Exonerado', impuesto_pct: 0 },
    ]
    const lineasCargo: LineaCargoInputCalculo[] = [
      { id: 'c1', concepto: 'FLETE', monto_input: '500', porcentaje_iva: 16 },
    ]
    const pagos: PagoCompraCalculoInput[] = [{ moneda: 'BS', monto: 3000 }]
    const moneda = 'BS'
    const tasaFacturaNum = 41.2
    const tasaInternaNum = 41.2
    const usaTasaParalela = false

    const original = formulaOriginal(lineas, lineasCargo, pagos, moneda, tasaFacturaNum, tasaInternaNum, usaTasaParalela)

    const totalDisplay = lineas.reduce((s, l) => new Decimal(s).plus(getLineSubtotal(l)).toNumber(), 0)
    const desgloseUsd = calcDesgloseUsd(lineas, moneda, tasaFacturaNum)
    // moneda = 'BS' en este escenario: el IVA display se calcula directo en Bs
    // (misma rama que `compra-form.tsx` toma para moneda BS).
    const totalIvaBs = lineas.reduce((sum, l) => {
      if (l.tipo_impuesto !== 'Gravable') return sum
      return new Decimal(sum).plus(new Decimal(getLineSubtotal(l)).times(l.impuesto_pct).dividedBy(100)).toNumber()
    }, 0)
    const totalIvaDisplay = totalIvaBs
    const totalConIvaDisplay = new Decimal(totalDisplay).plus(totalIvaDisplay).toNumber()
    const lineasCargoUsd = convertirLineasCargo(lineasCargo, moneda, tasaFacturaNum)
    const cargoTotales = totalizarLineasCargo(lineasCargoUsd)
    const totalCargoUsd = new Decimal(cargoTotales.exentoUsd).plus(cargoTotales.baseUsd).plus(cargoTotales.ivaUsd)
    const totalUsd = calcTotalUsd(totalConIvaDisplay, totalCargoUsd.toNumber(), moneda, tasaFacturaNum)
    const totalUsdSistema = calcTotalUsdSistema(totalDisplay, totalUsd, moneda, tasaFacturaNum, tasaInternaNum, usaTasaParalela)
    const pendienteUsd = calcPendienteUsd(totalUsd, pagos, tasaFacturaNum)

    expect(desgloseUsd).toEqual(original.desgloseUsd)
    expect(totalUsd).toBe(original.totalUsd)
    expect(totalUsdSistema).toBe(original.totalUsdSistema)
    expect(pendienteUsd).toBe(original.pendienteUsd)
  })
})
