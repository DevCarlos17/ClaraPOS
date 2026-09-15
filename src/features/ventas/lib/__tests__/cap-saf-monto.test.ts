import Decimal from 'decimal.js'
import { bsToUsd } from '@/lib/currency'
import { capSafMontoUsd } from '../cap-saf-monto'

describe('capSafMontoUsd (fix pos-saf-input-bs — cobertura exacta de SAF sin excedente fantasma)', () => {
  it('capea al total de la factura cuando el disponible supera al total', () => {
    const resultado = capSafMontoUsd('50.00', '100.00', '30.00')
    expect(resultado.toNumber()).toBe(30)
  })

  it('capea al disponible cuando el disponible es menor que el total', () => {
    const resultado = capSafMontoUsd('50.00', '10.00', '100.00')
    expect(resultado.toNumber()).toBe(10)
  })

  it('preserva precision completa: Bs 754 a tasa 500 -> 1.508 USD exacto, no 1.51', () => {
    const usdDesdeBs = bsToUsd('754', '500') // 1.508 exacto
    const resultado = capSafMontoUsd(usdDesdeBs, '100.00', '100.00')
    expect(resultado.toFixed(8)).toBe('1.50800000')
    expect(resultado.toNumber()).toBe(1.508)
    expect(resultado.toFixed(2)).not.toBe(resultado.toFixed(8))
  })

  it('capea valores negativos a 0', () => {
    const resultado = capSafMontoUsd('-5.00', '100.00', '100.00')
    expect(resultado.toNumber()).toBe(0)
  })

  it('cubre EXACTO el total de la factura cuando el SAF derivado de Bs coincide con el total (caso que antes redondeaba a un excedente fantasma)', () => {
    // Reproduce el bug real: factura de Bs 754 a tasa 500, disponible SAF de
    // sobra ($100). El monto exacto que cubre la factura es 1.508 USD, NO
    // 1.51 (que el viejo clampearSafMonto producia via toDecimalPlaces(2) y
    // generaba un excedente fantasma de Bs 1 sobre el total real).
    const totalUsd = bsToUsd('754', '500') // 1.508
    const usdDesdeBs = bsToUsd('754', '500') // lo que el cajero tipea en Bs
    const resultado = capSafMontoUsd(usdDesdeBs, '100.00', totalUsd)
    expect(resultado.toFixed(8)).toBe(totalUsd.toFixed(8))
    expect(new Decimal(resultado).times('500').toFixed(2)).toBe('754.00')
  })
})
