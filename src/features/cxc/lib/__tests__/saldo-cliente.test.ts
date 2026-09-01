import Decimal from 'decimal.js'
import {
  calcularSaldoNuevoMovimientoCuenta,
  esSaldoSafConsistente,
} from '../saldo-cliente'

describe('calcularSaldoNuevoMovimientoCuenta', () => {
  it('FAC/NDB: suma el monto al saldo anterior (aumenta deuda)', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta('FAC', 0, 650)

    expect(resultado.toString()).toBe('650')
  })

  it('NDB: suma el monto al saldo anterior', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta('NDB', 650, 50)

    expect(resultado.toString()).toBe('700')
  })

  it('PAG/NCR: resta el monto al saldo anterior (reduce deuda)', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta('PAG', 650, 650)

    expect(resultado.toString()).toBe('0')
  })

  it('NCR: resta el monto al saldo anterior', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta('NCR', 300, 100)

    expect(resultado.toString()).toBe('200')
  })

  it('SAF-create: confia en saldoNuevoProvisto para creacion de credito (0 -> -0.70)', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta('SAF', 0, '0.70', '-0.70')

    expect(resultado.toString()).toBe('-0.7')
  })

  it('SAF-consume: regresion nucleo — confia en saldoNuevoProvisto (-0.70 -> 0, NO -1.40)', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta('SAF', '-0.70', '0.70', 0)

    expect(resultado.toString()).toBe('0')
    expect(resultado.toString()).not.toBe('-1.4')
  })

  it('SAF-debt-reduction: confia en saldoNuevoProvisto para reduccion de deuda positiva', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta('SAF', 300, 100, 200)

    expect(resultado.toString()).toBe('200')
  })

  it('REV/SAL: confia en saldoNuevoProvisto sin importar monto/saldoAnterior', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta('REV', 100, 50, 75)

    expect(resultado.toString()).toBe('75')
  })

  it('SAL: confia en saldoNuevoProvisto (importacion de saldo inicial)', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta('SAL', 0, 0, '1250.50')

    expect(resultado.toString()).toBe('1250.5')
  })

  it('SAF sin saldoNuevoProvisto: lanza error (el trigger no lo recalcula)', () => {
    expect(() => calcularSaldoNuevoMovimientoCuenta('SAF', 0, '0.70')).toThrow(
      /saldoNuevoProvisto/
    )
  })

  it('REV sin saldoNuevoProvisto: lanza error', () => {
    expect(() => calcularSaldoNuevoMovimientoCuenta('REV', 100, 50)).toThrow(
      /saldoNuevoProvisto/
    )
  })

  it('acepta instancias de Decimal como entrada', () => {
    const resultado = calcularSaldoNuevoMovimientoCuenta(
      'FAC',
      new Decimal(100),
      new Decimal(50)
    )

    expect(resultado.toString()).toBe('150')
  })
})

describe('esSaldoSafConsistente', () => {
  it('acepta consistencia en direccion "+monto" (consumo de credito, -0.70 -> 0)', () => {
    expect(esSaldoSafConsistente('-0.70', '0.70', 0)).toBe(true)
  })

  it('acepta consistencia en direccion "-monto" (reduccion de deuda, 300 -> 200)', () => {
    expect(esSaldoSafConsistente(300, 100, 200)).toBe(true)
  })

  it('acepta dentro de la tolerancia de 0.005', () => {
    expect(esSaldoSafConsistente(0, '0.70', '-0.699')).toBe(true)
  })

  it('rechaza el bug reproducido: saldoNuevo duplicado (-1.40 en vez de -0.70)', () => {
    // Creacion de credito: saldoAnterior=0, monto=0.70 -> correcto es -0.70.
    // -1.40 es el doble, un error de magnitud detectable sin ambiguedad de direccion.
    expect(esSaldoSafConsistente(0, '0.70', '-1.40')).toBe(false)
  })

  it('rechaza cuando la magnitud del cambio no coincide con monto, fuera de tolerancia', () => {
    expect(esSaldoSafConsistente(100, 50, 100)).toBe(false)
  })
})
