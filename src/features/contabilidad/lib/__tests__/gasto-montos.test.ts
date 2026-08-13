import {
  montoCostoGasto,
  montoIvaGasto,
  montoTotalGasto,
  deriveGastoTotales,
  type GastoMontos,
  type GastoTotalesInput,
} from '../gasto-montos'

function gasto(overrides: Partial<GastoMontos> = {}): GastoMontos {
  return {
    base_imponible_usd: '100.00',
    monto_iva_usd: '16.00',
    monto_usd: '116.00',
    ...overrides,
  }
}

describe('montoCostoGasto', () => {
  it('base=100 iva=16: costo = base_imponible_usd (100), no el total', () => {
    expect(montoCostoGasto(gasto())).toBe(100)
  })

  it('exento (iva=0): costo = base (igual al total, ya que no hay iva)', () => {
    const g = gasto({ base_imponible_usd: '50.00', monto_iva_usd: '0.00', monto_usd: '50.00' })
    expect(montoCostoGasto(g)).toBe(50)
  })

  it('base_imponible_usd vacio: fallback a monto_usd', () => {
    const g = gasto({ base_imponible_usd: '', monto_usd: '75.00' })
    expect(montoCostoGasto(g)).toBe(75)
  })

  it('fila manual vs fila de cargo: mismo shape, mismo resultado de costo', () => {
    const manual = gasto({ base_imponible_usd: '30.00', monto_iva_usd: '4.80', monto_usd: '34.80' })
    const cargo = gasto({ base_imponible_usd: '30.00', monto_iva_usd: '4.80', monto_usd: '34.80' })
    expect(montoCostoGasto(manual)).toBe(montoCostoGasto(cargo))
    expect(montoCostoGasto(cargo)).toBe(30)
  })
})

describe('montoIvaGasto', () => {
  it('base=100 iva=16: impuesto = 16', () => {
    expect(montoIvaGasto(gasto())).toBe(16)
  })

  it('monto_iva_usd vacio/faltante: impuesto = 0', () => {
    const g = gasto({ monto_iva_usd: '' })
    expect(montoIvaGasto(g)).toBe(0)
  })
})

describe('montoTotalGasto', () => {
  it('base=100 iva=16: total = monto_usd (116), no la suma recalculada', () => {
    expect(montoTotalGasto(gasto())).toBe(116)
  })

  it('exento: total = monto_usd = base (sin iva)', () => {
    const g = gasto({ base_imponible_usd: '50.00', monto_iva_usd: '0.00', monto_usd: '50.00' })
    expect(montoTotalGasto(g)).toBe(50)
  })
})

// ─── deriveGastoTotales ──────────────────────────────────────
//
// tasa (interna) fija en '25.0000' para todos los casos de la tabla.
// tasa_proveedor (paralela) fija en '40.0000' cuando aplica.
// tasaValor (tasa vigente, para el equivalente en Bs) fija en 37 para todos los casos.

const TASA_INTERNA = '25.0000'
const TASA_PROVEEDOR = '40.0000'
const TASA_VALOR = 37

function gastoTotalesInput(overrides: Partial<GastoTotalesInput> = {}): GastoTotalesInput {
  return {
    base_imponible_usd: '100.00',
    monto_iva_usd: '16.00',
    monto_usd: '116.00',
    moneda_factura: 'USD',
    usa_tasa_paralela: 0,
    tasa: TASA_INTERNA,
    tasa_proveedor: null,
    tipo_impuesto: 'Gravable',
    porcentaje_iva: '16.00',
    ...overrides,
  }
}

interface DeriveCase {
  label: string
  moneda_factura: string
  usa_tasa_paralela: number
  tasa_proveedor: string | null
  tipo_impuesto: string
  base_imponible_usd: string
  monto_iva_usd: string
  monto_usd: string
  porcentaje_iva: string
  expectedTotalProveedorUsd: number
  expectedUsaParalela: boolean
  expectedEsGravable: boolean
  expectedEsExento: boolean
  expectedEsExonerado: boolean
}

const DERIVE_CASES: DeriveCase[] = [
  // ── USD, sin paralela (tasaRef irrelevante: retorna monto_usd directo) ──
  {
    label: 'USD sin paralela, Gravable',
    moneda_factura: 'USD', usa_tasa_paralela: 0, tasa_proveedor: null, tipo_impuesto: 'Gravable',
    base_imponible_usd: '100.00', monto_iva_usd: '16.00', monto_usd: '116.00', porcentaje_iva: '16.00',
    expectedTotalProveedorUsd: 116, expectedUsaParalela: false,
    expectedEsGravable: true, expectedEsExento: false, expectedEsExonerado: false,
  },
  {
    label: 'USD sin paralela, Exento',
    moneda_factura: 'USD', usa_tasa_paralela: 0, tasa_proveedor: null, tipo_impuesto: 'Exento',
    base_imponible_usd: '50.00', monto_iva_usd: '0.00', monto_usd: '50.00', porcentaje_iva: '0.00',
    expectedTotalProveedorUsd: 50, expectedUsaParalela: false,
    expectedEsGravable: false, expectedEsExento: true, expectedEsExonerado: false,
  },
  {
    label: 'USD sin paralela, Exonerado',
    moneda_factura: 'USD', usa_tasa_paralela: 0, tasa_proveedor: null, tipo_impuesto: 'Exonerado',
    base_imponible_usd: '80.00', monto_iva_usd: '0.00', monto_usd: '80.00', porcentaje_iva: '0.00',
    expectedTotalProveedorUsd: 80, expectedUsaParalela: false,
    expectedEsGravable: false, expectedEsExento: false, expectedEsExonerado: true,
  },
  // ── USD, con paralela (moneda USD siempre corta a monto_usd directo) ──
  {
    label: 'USD con paralela, Gravable',
    moneda_factura: 'USD', usa_tasa_paralela: 1, tasa_proveedor: TASA_PROVEEDOR, tipo_impuesto: 'Gravable',
    base_imponible_usd: '100.00', monto_iva_usd: '16.00', monto_usd: '116.00', porcentaje_iva: '16.00',
    expectedTotalProveedorUsd: 116, expectedUsaParalela: true,
    expectedEsGravable: true, expectedEsExento: false, expectedEsExonerado: false,
  },
  {
    label: 'USD con paralela, Exento',
    moneda_factura: 'USD', usa_tasa_paralela: 1, tasa_proveedor: TASA_PROVEEDOR, tipo_impuesto: 'Exento',
    base_imponible_usd: '50.00', monto_iva_usd: '0.00', monto_usd: '50.00', porcentaje_iva: '0.00',
    expectedTotalProveedorUsd: 50, expectedUsaParalela: true,
    expectedEsGravable: false, expectedEsExento: true, expectedEsExonerado: false,
  },
  {
    label: 'USD con paralela, Exonerado',
    moneda_factura: 'USD', usa_tasa_paralela: 1, tasa_proveedor: TASA_PROVEEDOR, tipo_impuesto: 'Exonerado',
    base_imponible_usd: '80.00', monto_iva_usd: '0.00', monto_usd: '80.00', porcentaje_iva: '0.00',
    expectedTotalProveedorUsd: 80, expectedUsaParalela: true,
    expectedEsGravable: false, expectedEsExento: false, expectedEsExonerado: true,
  },
  // ── BS, sin paralela (tasaRef = tasa interna = 25) ──
  {
    label: 'BS sin paralela, Gravable',
    moneda_factura: 'BS', usa_tasa_paralela: 0, tasa_proveedor: null, tipo_impuesto: 'Gravable',
    base_imponible_usd: '100.00', monto_iva_usd: '16.00', monto_usd: '116.00', porcentaje_iva: '16.00',
    expectedTotalProveedorUsd: 4.64, expectedUsaParalela: false,
    expectedEsGravable: true, expectedEsExento: false, expectedEsExonerado: false,
  },
  {
    label: 'BS sin paralela, Exento',
    moneda_factura: 'BS', usa_tasa_paralela: 0, tasa_proveedor: null, tipo_impuesto: 'Exento',
    base_imponible_usd: '50.00', monto_iva_usd: '0.00', monto_usd: '50.00', porcentaje_iva: '0.00',
    expectedTotalProveedorUsd: 2, expectedUsaParalela: false,
    expectedEsGravable: false, expectedEsExento: true, expectedEsExonerado: false,
  },
  {
    label: 'BS sin paralela, Exonerado',
    moneda_factura: 'BS', usa_tasa_paralela: 0, tasa_proveedor: null, tipo_impuesto: 'Exonerado',
    base_imponible_usd: '80.00', monto_iva_usd: '0.00', monto_usd: '80.00', porcentaje_iva: '0.00',
    expectedTotalProveedorUsd: 3.2, expectedUsaParalela: false,
    expectedEsGravable: false, expectedEsExento: false, expectedEsExonerado: true,
  },
  // ── BS, con paralela (tasaRef = tasa proveedor = 40) ──
  {
    label: 'BS con paralela, Gravable',
    moneda_factura: 'BS', usa_tasa_paralela: 1, tasa_proveedor: TASA_PROVEEDOR, tipo_impuesto: 'Gravable',
    base_imponible_usd: '100.00', monto_iva_usd: '16.00', monto_usd: '116.00', porcentaje_iva: '16.00',
    expectedTotalProveedorUsd: 2.9, expectedUsaParalela: true,
    expectedEsGravable: true, expectedEsExento: false, expectedEsExonerado: false,
  },
  {
    label: 'BS con paralela, Exento',
    moneda_factura: 'BS', usa_tasa_paralela: 1, tasa_proveedor: TASA_PROVEEDOR, tipo_impuesto: 'Exento',
    base_imponible_usd: '50.00', monto_iva_usd: '0.00', monto_usd: '50.00', porcentaje_iva: '0.00',
    expectedTotalProveedorUsd: 1.25, expectedUsaParalela: true,
    expectedEsGravable: false, expectedEsExento: true, expectedEsExonerado: false,
  },
  {
    label: 'BS con paralela, Exonerado',
    moneda_factura: 'BS', usa_tasa_paralela: 1, tasa_proveedor: TASA_PROVEEDOR, tipo_impuesto: 'Exonerado',
    base_imponible_usd: '80.00', monto_iva_usd: '0.00', monto_usd: '80.00', porcentaje_iva: '0.00',
    expectedTotalProveedorUsd: 2, expectedUsaParalela: true,
    expectedEsGravable: false, expectedEsExento: false, expectedEsExonerado: true,
  },
]

describe('deriveGastoTotales', () => {
  it.each(DERIVE_CASES)('$label', (c) => {
    const input = gastoTotalesInput({
      base_imponible_usd: c.base_imponible_usd,
      monto_iva_usd: c.monto_iva_usd,
      monto_usd: c.monto_usd,
      moneda_factura: c.moneda_factura,
      usa_tasa_paralela: c.usa_tasa_paralela,
      tasa_proveedor: c.tasa_proveedor,
      tipo_impuesto: c.tipo_impuesto,
      porcentaje_iva: c.porcentaje_iva,
    })

    const result = deriveGastoTotales(input, TASA_VALOR)

    expect(result.totalProveedorUsd).toBeCloseTo(c.expectedTotalProveedorUsd, 6)
    expect(result.totalContableUsd).toBeCloseTo(parseFloat(c.monto_usd), 6)
    expect(result.totalBs).toBeCloseTo(parseFloat(c.monto_usd) * TASA_VALOR, 6)
    expect(result.baseUsd).toBeCloseTo(parseFloat(c.base_imponible_usd), 6)
    expect(result.ivaUsd).toBeCloseTo(parseFloat(c.monto_iva_usd), 6)
    expect(result.usaParalela).toBe(c.expectedUsaParalela)
    expect(result.esGravable).toBe(c.expectedEsGravable)
    expect(result.esExento).toBe(c.expectedEsExento)
    expect(result.esExonerado).toBe(c.expectedEsExonerado)
  })

  it('regresion: totalProveedorUsd usa monto_usd (total con IVA), no monto_factura (base) — Gasto gravable con IVA 16%', () => {
    // Spec scenario "Gasto gravable con IVA 16%": base 10.00 USD, IVA 16% (1.60 USD) -> Total Factura = 11.60 USD
    const input = gastoTotalesInput({
      base_imponible_usd: '10.00',
      monto_iva_usd: '1.60',
      monto_usd: '11.60',
      moneda_factura: 'USD',
      usa_tasa_paralela: 0,
      tasa_proveedor: null,
      tipo_impuesto: 'Gravable',
      porcentaje_iva: '16.00',
    })

    const result = deriveGastoTotales(input, TASA_VALOR)

    expect(result.totalProveedorUsd).toBe(11.6)
    expect(result.totalProveedorUsd).not.toBe(10)
  })

  it('regresion: en Bs con tasa paralela, se convierte el total (base+IVA), no la base sola', () => {
    // Spec scenario "Gasto en Bs con tasa paralela": el monto convertido es base+IVA (el total)
    const input = gastoTotalesInput({
      base_imponible_usd: '100.00',
      monto_iva_usd: '16.00',
      monto_usd: '116.00',
      moneda_factura: 'BS',
      usa_tasa_paralela: 1,
      tasa_proveedor: TASA_PROVEEDOR,
      tipo_impuesto: 'Gravable',
      porcentaje_iva: '16.00',
    })

    const result = deriveGastoTotales(input, TASA_VALOR)

    // 116 (total) / 40 (tasa proveedor) = 2.90 — si usara solo la base (100/40=2.50), fallaria
    expect(result.totalProveedorUsd).toBe(2.9)
    expect(result.totalProveedorUsd).not.toBe(2.5)
  })
})
