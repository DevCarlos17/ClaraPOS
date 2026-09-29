import {
  calcIvaFactura,
  calcMontoContableUsd,
  calcMontoProveedorUsd,
  calcTotalFactura,
} from '../gasto-totales'

// Fixtures calculados a mano a partir del bloque original de gasto-form.tsx
// (parseFloat + Number(x.toFixed(2)), sin decimal.js). Los valores de
// division se comparan con la MISMA expresion JS que produciria el codigo
// original, para garantizar paridad de punto flotante byte-a-byte.

describe('calcIvaFactura', () => {
  it('Gravable: aplica porcentaje y redondea a 2 decimales', () => {
    expect(calcIvaFactura(100, 16, 'Gravable')).toBe(16)
  })

  it('Gravable con decimales: redondeo a 2 decimales (100 * 7.5% = 7.5)', () => {
    expect(calcIvaFactura(100, 7.5, 'Gravable')).toBe(7.5)
  })

  it('Exento: IVA siempre 0 sin importar porcentajeIva', () => {
    expect(calcIvaFactura(1000, 16, 'Exento')).toBe(0)
  })

  it('Exonerado: IVA siempre 0 sin importar porcentajeIva', () => {
    expect(calcIvaFactura(500, 16, 'Exonerado')).toBe(0)
  })

  it('monto base 0: IVA 0', () => {
    expect(calcIvaFactura(0, 16, 'Gravable')).toBe(0)
  })
})

describe('calcTotalFactura', () => {
  it('suma base + iva y redondea a 2 decimales', () => {
    expect(calcTotalFactura(100, 16)).toBe(116)
  })

  it('base 0 + iva 0 = 0', () => {
    expect(calcTotalFactura(0, 0)).toBe(0)
  })

  it('redondea correctamente sumas con residuo flotante', () => {
    expect(calcTotalFactura(100, 7.5)).toBe(107.5)
  })
})

describe('calcMontoContableUsd', () => {
  it('Gravable, USD, sin tasa paralela: retorna totalFacturaNum directo', () => {
    const result = calcMontoContableUsd({
      totalFacturaNum: 116,
      monedaFactura: 'USD',
      usaTasaParalela: false,
      tasaInternaNum: 36.5,
      tasaProveedorNum: 0,
    })
    expect(result).toBe(116)
  })

  it('Exento, BS, sin tasa paralela: divide por tasa interna', () => {
    const result = calcMontoContableUsd({
      totalFacturaNum: 1000,
      monedaFactura: 'BS',
      usaTasaParalela: false,
      tasaInternaNum: 50,
      tasaProveedorNum: 0,
    })
    expect(result).toBe(1000 / 50)
  })

  it('Exonerado, BS, tasa paralela ON: rama BS ignora tasa paralela (retorna igual que sin paralela)', () => {
    const result = calcMontoContableUsd({
      totalFacturaNum: 500,
      monedaFactura: 'BS',
      usaTasaParalela: true,
      tasaInternaNum: 40,
      tasaProveedorNum: 45,
    })
    expect(result).toBe(500 / 40)
  })

  it('Gravable, USD, tasa paralela ON: multiplica por tasa proveedor y divide por tasa interna', () => {
    const result = calcMontoContableUsd({
      totalFacturaNum: 232,
      monedaFactura: 'USD',
      usaTasaParalela: true,
      tasaInternaNum: 36.5,
      tasaProveedorNum: 40,
    })
    expect(result).toBe((232 * 40) / 36.5)
  })

  it('totalFacturaNum <= 0: retorna null', () => {
    const result = calcMontoContableUsd({
      totalFacturaNum: 0,
      monedaFactura: 'USD',
      usaTasaParalela: false,
      tasaInternaNum: 36.5,
      tasaProveedorNum: 0,
    })
    expect(result).toBeNull()
  })

  it('tasaInternaNum <= 0: retorna null aunque totalFacturaNum sea positivo', () => {
    const result = calcMontoContableUsd({
      totalFacturaNum: 100,
      monedaFactura: 'USD',
      usaTasaParalela: false,
      tasaInternaNum: 0,
      tasaProveedorNum: 0,
    })
    expect(result).toBeNull()
  })

  it('USD, tasa paralela ON pero tasaProveedorNum 0: retorna totalFacturaNum directo (guardia >0)', () => {
    const result = calcMontoContableUsd({
      totalFacturaNum: 200,
      monedaFactura: 'USD',
      usaTasaParalela: true,
      tasaInternaNum: 36.5,
      tasaProveedorNum: 0,
    })
    expect(result).toBe(200)
  })
})

describe('calcMontoProveedorUsd', () => {
  it('USD: retorna totalFacturaNum directo, independiente de tasa paralela', () => {
    const result = calcMontoProveedorUsd({
      totalFacturaNum: 232,
      monedaFactura: 'USD',
      usaTasaParalela: true,
      tasaInternaNum: 36.5,
      tasaProveedorNum: 40,
    })
    expect(result).toBe(232)
  })

  it('BS sin tasa paralela: divide por tasa interna', () => {
    const result = calcMontoProveedorUsd({
      totalFacturaNum: 1000,
      monedaFactura: 'BS',
      usaTasaParalela: false,
      tasaInternaNum: 50,
      tasaProveedorNum: 0,
    })
    expect(result).toBe(1000 / 50)
  })

  it('BS con tasa paralela ON: divide por tasa proveedor (no por la interna)', () => {
    const result = calcMontoProveedorUsd({
      totalFacturaNum: 500,
      monedaFactura: 'BS',
      usaTasaParalela: true,
      tasaInternaNum: 40,
      tasaProveedorNum: 45,
    })
    expect(result).toBe(500 / 45)
  })

  it('totalFacturaNum <= 0: retorna null', () => {
    const result = calcMontoProveedorUsd({
      totalFacturaNum: 0,
      monedaFactura: 'BS',
      usaTasaParalela: false,
      tasaInternaNum: 50,
      tasaProveedorNum: 0,
    })
    expect(result).toBeNull()
  })

  it('BS sin tasa interna ni proveedor positivos: retorna null', () => {
    const result = calcMontoProveedorUsd({
      totalFacturaNum: 100,
      monedaFactura: 'BS',
      usaTasaParalela: false,
      tasaInternaNum: 0,
      tasaProveedorNum: 0,
    })
    expect(result).toBeNull()
  })
})

describe('flujo completo (paridad con gasto-form.tsx L470-502)', () => {
  it('Gravable + USD + sin paralela: caso base', () => {
    const iva = calcIvaFactura(100, 16, 'Gravable')
    const total = calcTotalFactura(100, iva)
    expect(iva).toBe(16)
    expect(total).toBe(116)
    expect(
      calcMontoContableUsd({
        totalFacturaNum: total,
        monedaFactura: 'USD',
        usaTasaParalela: false,
        tasaInternaNum: 36.5,
        tasaProveedorNum: 0,
      })
    ).toBe(116)
    expect(
      calcMontoProveedorUsd({
        totalFacturaNum: total,
        monedaFactura: 'USD',
        usaTasaParalela: false,
        tasaInternaNum: 36.5,
        tasaProveedorNum: 0,
      })
    ).toBe(116)
  })

  it('Exento + BS + sin paralela: caso base', () => {
    const iva = calcIvaFactura(1000, 0, 'Exento')
    const total = calcTotalFactura(1000, iva)
    expect(iva).toBe(0)
    expect(total).toBe(1000)
    expect(
      calcMontoContableUsd({
        totalFacturaNum: total,
        monedaFactura: 'BS',
        usaTasaParalela: false,
        tasaInternaNum: 50,
        tasaProveedorNum: 0,
      })
    ).toBe(20)
    expect(
      calcMontoProveedorUsd({
        totalFacturaNum: total,
        monedaFactura: 'BS',
        usaTasaParalela: false,
        tasaInternaNum: 50,
        tasaProveedorNum: 0,
      })
    ).toBe(20)
  })
})
