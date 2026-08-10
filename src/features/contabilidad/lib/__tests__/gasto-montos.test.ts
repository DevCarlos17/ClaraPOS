import { montoCostoGasto, montoIvaGasto, montoTotalGasto, type GastoMontos } from '../gasto-montos'

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
