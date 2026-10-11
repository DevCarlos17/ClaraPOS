import { evaluarSafMonto } from '../saf-monto'

/**
 * TDD table for PR-A1 (sdd/saf-snapshot-y-trazabilidad/design-b22-dual-input,
 * #5267): `evaluarSafMonto` reemplaza `capSafMontoUsd` (clamp silencioso) por
 * un estado explicito que el llamador usa para AND-ear su gate de submit y
 * mostrar un warning distinto por motivo. Sin epsilon dentro del helper — el
 * llamador pre-redondea `disponibleUsd` a 2dp antes de llamar (Design
 * §Architecture Decisions, tabla "Tolerancia/epsilon").
 */
describe('evaluarSafMonto (reemplaza capSafMontoUsd, PR-A1 saf-dual-input)', () => {
  it('monto dentro de ambos topes -> ok', () => {
    expect(evaluarSafMonto('50.00', '100.00', '100.00')).toBe('ok')
  })

  it('monto excede el disponible del cliente (pero no el total) -> excedeDisponible', () => {
    expect(evaluarSafMonto('50.00', '30.00', '100.00')).toBe('excedeDisponible')
  })

  it('monto excede el total a pagar (pero no el disponible) -> excedeTotal', () => {
    expect(evaluarSafMonto('50.00', '100.00', '30.00')).toBe('excedeTotal')
  })

  it('monto excede AMBOS topes a la vez -> precedencia excedeTotal (mirror refund-tesoreria-form.tsx:659-661)', () => {
    expect(evaluarSafMonto('50.00', '20.00', '10.00')).toBe('excedeTotal')
  })

  it('boundary: monto === disponible (con total holgado) -> ok (tope no-estricto, permite el 100%)', () => {
    expect(evaluarSafMonto('30.00', '30.00', '100.00')).toBe('ok')
  })

  it('boundary: monto === total (con disponible holgado) -> ok (tope no-estricto, permite el 100%, fix PR11 SAF-only)', () => {
    expect(evaluarSafMonto('30.00', '100.00', '30.00')).toBe('ok')
  })

  it('monto vacio (string en blanco) se trata como 0 -> ok', () => {
    expect(evaluarSafMonto('', '100.00', '100.00')).toBe('ok')
  })

  it('monto negativo se trata como no-excedente -> ok', () => {
    expect(evaluarSafMonto('-5.00', '100.00', '100.00')).toBe('ok')
  })

  it('precision de tasa/Decimal: Bs 754 a tasa 500 = 1.508 USD exacto, no 1.51 por redondeo, no excede un tope de 1.508', () => {
    const usdDesdeBs = (1.508).toString()
    expect(evaluarSafMonto(usdDesdeBs, '100.00', '1.508')).toBe('ok')
  })
})
