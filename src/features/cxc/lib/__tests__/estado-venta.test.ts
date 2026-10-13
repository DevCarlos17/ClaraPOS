import Decimal from 'decimal.js'
import { calcularEstadoVenta } from '../estado-venta'

// =============================================
// calcularEstadoVenta — matriz design.md §4
// =============================================
// Cubre cada escenario de design.md §4 / specs/ventas-estado-derivado/spec.md
// como fixture data. Espejo 1:1 del CASE del trigger `prevent_venta_mutation()`
// en migrations/0106 — ver design.md §9 (riesgo de duplicacion, mitigado por
// esta tabla de fixtures que dobla como referencia de paridad).

describe('calcularEstadoVenta', () => {
  it('CONTADO pagada al crearse: saldo_pend_usd=0 -> pago', () => {
    const resultado = calcularEstadoVenta(new Decimal('0'), new Decimal('100'), null)
    expect(resultado).toBe('pago')
  })

  it('CREDITO sin abonos: saldo_pend_usd=total_usd -> pendiente', () => {
    const resultado = calcularEstadoVenta(new Decimal('100'), new Decimal('100'), null)
    expect(resultado).toBe('pendiente')
  })

  it('pago parcial: 0 < saldo_pend_usd < total_usd - 0.005 -> parcial', () => {
    const resultado = calcularEstadoVenta(new Decimal('60'), new Decimal('100'), 'PAG')
    expect(resultado).toBe('parcial')
  })

  it('NC cubre totalmente una factura CONTADO ya pagada: saldo llega a 0 via NCR -> sigue pago', () => {
    const resultado = calcularEstadoVenta(new Decimal('0'), new Decimal('100'), 'NCR')
    expect(resultado).toBe('pago')
  })

  it('reverso reabre una factura paga: REV sube saldo_pend_usd > 0.005 -> reversado', () => {
    const resultado = calcularEstadoVenta(new Decimal('50'), new Decimal('100'), 'REV')
    expect(resultado).toBe('reversado')
  })

  it('nuevo pago despues de un reverso limpia el estado: PAG lleva saldo a 0 -> pago (no reversado)', () => {
    const resultado = calcularEstadoVenta(new Decimal('0'), new Decimal('100'), 'PAG')
    expect(resultado).toBe('pago')
  })

  it('tolerancia de 0.005: saldo_pend_usd=0.004 se trata como pago (dentro de tolerancia)', () => {
    const resultado = calcularEstadoVenta(new Decimal('0.004'), new Decimal('100'), 'PAG')
    expect(resultado).toBe('pago')
  })

  it('tolerancia de 0.005: saldo_pend_usd a 0.005 del total se trata como pendiente', () => {
    const resultado = calcularEstadoVenta(new Decimal('99.996'), new Decimal('100'), null)
    expect(resultado).toBe('pendiente')
  })

  it('ultimoMovimientoTipo=REV pero saldo_pend_usd ya esta dentro de tolerancia: no es reversado, es pago', () => {
    // Guard de la regla: REV solo gana si saldo_pend_usd > 0.005 (spec: "resultando saldo_pend_usd > 0.005")
    const resultado = calcularEstadoVenta(new Decimal('0.003'), new Decimal('100'), 'REV')
    expect(resultado).toBe('pago')
  })

  it('SAF reduce parcialmente una factura CREDITO: saldo intermedio -> parcial', () => {
    const resultado = calcularEstadoVenta(new Decimal('25'), new Decimal('100'), 'SAF')
    expect(resultado).toBe('parcial')
  })
})
