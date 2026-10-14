import Decimal from 'decimal.js'
import { calcularEstadoVenta } from '../estado-venta'

// =============================================
// calcularEstadoVenta — matriz design.md §4
// =============================================
// Cubre cada escenario de design.md §4 / specs/ventas-estado-derivado/spec.md
// como fixture data. Espejo 1:1 del CASE del trigger `prevent_venta_mutation()`
// en migrations/0108 (tolerancia 0, corrige 0106) — ver design.md §9 (riesgo
// de duplicacion, mitigado por esta tabla de fixtures que dobla como
// referencia de paridad).
//
// TOLERANCIA 0 (interim, migrations/0108): `estado='pago'` ahora exige
// saldo_pend_usd EXACTAMENTE 0, no "dentro de 0.005 USD". Cualquier saldo
// mayor a 0, por mas chico que sea, deja de ser 'pago'. Ver estado-venta.ts
// para el detalle de por que esto es una decision INTERINA, no la respuesta
// final sobre residuos de redondeo.

describe('calcularEstadoVenta', () => {
  it('CONTADO pagada al crearse: saldo_pend_usd=0 -> pago', () => {
    const resultado = calcularEstadoVenta(new Decimal('0'), new Decimal('100'), null)
    expect(resultado).toBe('pago')
  })

  it('CREDITO sin abonos: saldo_pend_usd=total_usd -> pendiente', () => {
    const resultado = calcularEstadoVenta(new Decimal('100'), new Decimal('100'), null)
    expect(resultado).toBe('pendiente')
  })

  it('pago parcial: 0 < saldo_pend_usd < total_usd -> parcial', () => {
    const resultado = calcularEstadoVenta(new Decimal('60'), new Decimal('100'), 'PAG')
    expect(resultado).toBe('parcial')
  })

  it('NC cubre totalmente una factura CONTADO ya pagada: saldo llega a 0 via NCR -> sigue pago', () => {
    const resultado = calcularEstadoVenta(new Decimal('0'), new Decimal('100'), 'NCR')
    expect(resultado).toBe('pago')
  })

  it('reverso reabre una factura paga: REV sube saldo_pend_usd > 0 -> reversado', () => {
    const resultado = calcularEstadoVenta(new Decimal('50'), new Decimal('100'), 'REV')
    expect(resultado).toBe('reversado')
  })

  it('nuevo pago despues de un reverso limpia el estado: PAG lleva saldo a 0 -> pago (no reversado)', () => {
    const resultado = calcularEstadoVenta(new Decimal('0'), new Decimal('100'), 'PAG')
    expect(resultado).toBe('pago')
  })

  it('tolerancia 0: saldo_pend_usd=0.004 YA NO se trata como pago — es parcial (antes era "pago" bajo tolerancia 0.005)', () => {
    const resultado = calcularEstadoVenta(new Decimal('0.004'), new Decimal('100'), 'PAG')
    expect(resultado).toBe('parcial')
  })

  it('tolerancia 0: saldo_pend_usd a 0.004 del total YA NO se trata como pendiente — es parcial (antes era "pendiente" bajo tolerancia 0.005)', () => {
    const resultado = calcularEstadoVenta(new Decimal('99.996'), new Decimal('100'), null)
    expect(resultado).toBe('parcial')
  })

  it('tolerancia 0: saldo_pend_usd exactamente igual a total_usd sigue siendo pendiente (boundary exacto, no aproximado)', () => {
    const resultado = calcularEstadoVenta(new Decimal('99.999999'), new Decimal('99.999999'), null)
    expect(resultado).toBe('pendiente')
  })

  it('tolerancia 0: ultimoMovimientoTipo=REV con saldo_pend_usd=0.003 (antes "dentro de tolerancia") AHORA SI es reversado, porque 0.003 > 0', () => {
    // Bajo tolerancia 0.005 este mismo saldo resultaba en 'pago'. Con tolerancia
    // 0, CUALQUIER saldo > 0 tras un REV reabre la deuda — ya no hay zona gris.
    const resultado = calcularEstadoVenta(new Decimal('0.003'), new Decimal('100'), 'REV')
    expect(resultado).toBe('reversado')
  })

  it('ultimoMovimientoTipo=REV pero saldo_pend_usd es EXACTAMENTE 0: no es reversado, es pago (boundary del guard REV)', () => {
    // Guard de la regla: REV solo gana si saldo_pend_usd > 0 (tolerancia 0).
    const resultado = calcularEstadoVenta(new Decimal('0'), new Decimal('100'), 'REV')
    expect(resultado).toBe('pago')
  })

  it('triangulacion tolerancia 0: saldo_pend_usd=0.00000001 (residuo infinitesimal) -> NO es pago, es parcial', () => {
    const resultado = calcularEstadoVenta(new Decimal('0.00000001'), new Decimal('100'), 'PAG')
    expect(resultado).toBe('parcial')
  })

  it('SAF reduce parcialmente una factura CREDITO: saldo intermedio -> parcial', () => {
    const resultado = calcularEstadoVenta(new Decimal('25'), new Decimal('100'), 'SAF')
    expect(resultado).toBe('parcial')
  })
})
