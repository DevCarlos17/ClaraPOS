import Decimal from 'decimal.js'
import {
  nativoAUsd,
  calcularRemanenteRefund,
  excedeSaldoDisponible,
  pendienteRestanteLineaUsd,
  usdACapNativo,
  capMontoLinea,
  permiteIngresoMonto,
} from '../notas-credito-refund'

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

describe('excedeSaldoDisponible — tope de saldo disponible por moneda (Design §Interfaces)', () => {
  it('monto mayor al saldo disponible -> true (excede)', () => {
    expect(excedeSaldoDisponible('150', '100')).toBe(true)
  })

  it('monto igual al saldo disponible -> false (tope no-estricto, permite usar el 100%)', () => {
    expect(excedeSaldoDisponible('100', '100')).toBe(false)
  })

  it('monto por debajo del saldo disponible -> false', () => {
    expect(excedeSaldoDisponible('60', '100')).toBe(false)
  })

  it('precision con strings de mas de 2 decimales: 100.123456 > 100.123455 -> true', () => {
    expect(excedeSaldoDisponible('100.123456', '100.123455')).toBe(true)
  })
})

describe('pendienteRestanteLineaUsd — pendiente de la NC disponible para UNA linea (Ajuste UX post-QA #3, Opcion A)', () => {
  it('sin otras lineas consumiendo el tope, el pendiente completo queda disponible para la linea', () => {
    expect(pendienteRestanteLineaUsd('100', '0').toFixed(2)).toBe('100.00')
  })

  it('resta lo que ya consumen las OTRAS lineas del tope total de la NC', () => {
    expect(pendienteRestanteLineaUsd('100', '60').toFixed(2)).toBe('40.00')
  })

  it('nunca queda negativo si las otras lineas ya exceden el tope (floor en 0)', () => {
    expect(pendienteRestanteLineaUsd('100', '150').toFixed(2)).toBe('0.00')
  })
})

describe('usdACapNativo — convierte un tope de USD a la moneda NATIVA de la linea (inverso de nativoAUsd, Ajuste UX post-QA #3)', () => {
  it('moneda nativa Bs: 100 USD a tasa_historica=40.00 -> 4000 Bs', () => {
    expect(usdACapNativo('100', true, '40.00').toFixed(2)).toBe('4000.00')
  })

  it('moneda nativa USD: pass-through sin conversion', () => {
    expect(usdACapNativo('100', false, '40.00').toFixed(2)).toBe('100.00')
  })

  it('usa SIEMPRE la tasa_historica de la NC, nunca la tasa vigente (misma regla que nativoAUsd)', () => {
    const conHistorica = usdACapNativo('100', true, '40.00')
    const conOtraTasa = usdACapNativo('100', true, '50.00')
    expect(conHistorica.toFixed(2)).not.toBe(conOtraTasa.toFixed(2))
  })
})

describe('capMontoLinea — tope efectivo = MIN(pendiente de la NC, disponible del origen elegido) (Ajuste UX post-QA #3, Opcion A)', () => {
  it('el disponible del origen es MENOR que el pendiente: el tope efectivo es el disponible', () => {
    expect(capMontoLinea('100', '60').toFixed(2)).toBe('60.00')
  })

  it('el pendiente es MENOR que el disponible del origen: el tope efectivo es el pendiente', () => {
    expect(capMontoLinea('40', '100').toFixed(2)).toBe('40.00')
  })

  it('disponible desconocido (null — origen aun sin resolver, ej. Tesoreria sin Cuenta elegida): el tope es SOLO el pendiente', () => {
    expect(capMontoLinea('40', null).toFixed(2)).toBe('40.00')
  })

  it('pendiente y disponible iguales: el tope es ese mismo valor (sin ambiguedad)', () => {
    expect(capMontoLinea('50', '50').toFixed(2)).toBe('50.00')
  })
})

describe('permiteIngresoMonto — rechaza el keystroke que dejaria el campo por ENCIMA del tope, sin romper la edicion de decimales (Ajuste UX post-QA #3, Opcion A)', () => {
  it('un valor por debajo del tope se permite', () => {
    expect(permiteIngresoMonto('60', '100')).toBe(true)
  })

  it('un valor EXACTAMENTE igual al tope se permite (tope no-estricto, permite usar el 100%)', () => {
    expect(permiteIngresoMonto('100', '100')).toBe(true)
  })

  it('un valor por ENCIMA del tope se RECHAZA', () => {
    expect(permiteIngresoMonto('101', '100')).toBe(false)
  })

  it('cap 100: "110" se rechaza (nunca debe aceptarse ese valor, ej. concreto del pedido de UX)', () => {
    expect(permiteIngresoMonto('110', '100')).toBe(false)
  })

  it('el campo vacio SIEMPRE se permite (borrar para reescribir no debe atrapar al usuario)', () => {
    expect(permiteIngresoMonto('', '100')).toBe(true)
  })

  it('un estado intermedio de edicion decimal ("12.") se permite aunque decimal.js ya lo parsee como 12 (no bloquea la escritura del punto)', () => {
    expect(permiteIngresoMonto('12.', '100')).toBe(true)
  })

  it('un punto decimal solo (".") se permite como estado intermedio de escritura leading-dot (patron ya usado en el resto del codebase)', () => {
    expect(permiteIngresoMonto('.', '100')).toBe(true)
  })

  it('precision con mas de 2 decimales: 100.123456 contra un tope de 100.123455 se rechaza (Decimal, nunca number vs number)', () => {
    expect(permiteIngresoMonto('100.123456', '100.123455')).toBe(false)
  })
})
