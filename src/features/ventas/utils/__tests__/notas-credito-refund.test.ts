import Decimal from 'decimal.js'
import { nativoAUsd, calcularRemanenteRefund } from '../notas-credito-refund'

/**
 * Modulo PURO (sin DB, sin React) — Slice 2 de nc-refund-tesoreria.
 * Cubre Spec `notas-credito-liquidacion`:
 *   - Requirement "Conversion a tasa historica de la NC (multi-moneda)"
 *   - Requirement "Tope — el reembolso no puede exceder el monto de la NC"
 *   - Requirement "Remanente no reembolsado pasa a SAFC"
 */

describe('nativoAUsd — conversion a tasa historica (Design §e, espejo de _esBancoBS)', () => {
  it('Scenario "Cuenta bancaria en Bolivares": 4000 Bs a tasa_historica=40.00 -> 100.00 USD', () => {
    const r = nativoAUsd('4000', true, '40.00')
    expect(r.toFixed(2)).toBe('100.00')
  })

  it('Scenario "Cuenta en USD": 100.00 USD pass-through, sin conversion', () => {
    const r = nativoAUsd('100.00', false, '40.00')
    expect(r.toFixed(2)).toBe('100.00')
  })

  it('usa la tasa_historica de la NC, NUNCA la tasa vigente del sistema (tasa distinta produce resultado distinto)', () => {
    const rHistorica = nativoAUsd('4000', true, '40.00')
    const rOtraTasa = nativoAUsd('4000', true, '50.00')
    expect(rHistorica.toFixed(2)).toBe('100.00')
    expect(rOtraTasa.toFixed(2)).toBe('80.00')
    expect(rHistorica.toFixed(2)).not.toBe(rOtraTasa.toFixed(2))
  })
})

describe('calcularRemanenteRefund — tope + remanente a SAFC (Design §d)', () => {
  it('Scenario "NC de 100, refund parcial de 60, resto a SAFC": remanenteSafc=40, excedeTope=false', () => {
    const r = calcularRemanenteRefund('100.00', [new Decimal('60.00')])
    expect(r.sumaUsd.toFixed(2)).toBe('60.00')
    expect(r.remanenteSafc.toFixed(2)).toBe('40.00')
    expect(r.excedeTope).toBe(false)
  })

  it('reembolso 100% (suma == remanente): remanenteSafc=0, excedeTope=false', () => {
    const r = calcularRemanenteRefund('100.00', [new Decimal('100.00')])
    expect(r.sumaUsd.toFixed(2)).toBe('100.00')
    expect(r.remanenteSafc.toFixed(2)).toBe('0.00')
    expect(r.excedeTope).toBe(false)
  })

  it('Scenario "Intento de exceder el monto de la NC rechazado": suma 120.00 contra NC de 100.00 -> excedeTope=true', () => {
    const r = calcularRemanenteRefund('100.00', [new Decimal('120.00')])
    expect(r.excedeTope).toBe(true)
  })

  it('multi-linea (Scenario "Refund dividido entre banco y caja fuerte"): suma ambas lineas antes de comparar contra el tope', () => {
    const r = calcularRemanenteRefund('150.00', [new Decimal('100.00'), new Decimal('50.00')])
    expect(r.sumaUsd.toFixed(2)).toBe('150.00')
    expect(r.remanenteSafc.toFixed(2)).toBe('0.00')
    expect(r.excedeTope).toBe(false)
  })

  it('array vacio de lineas: sumaUsd=0, remanenteSafc=remanenteALiquidar completo, excedeTope=false', () => {
    const r = calcularRemanenteRefund('100.00', [])
    expect(r.sumaUsd.toFixed(2)).toBe('0.00')
    expect(r.remanenteSafc.toFixed(2)).toBe('100.00')
    expect(r.excedeTope).toBe(false)
  })
})
