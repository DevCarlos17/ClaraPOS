import { convertirMontoRawEntreMonedas } from '../convertir-monto-moneda'

describe('convertirMontoRawEntreMonedas', () => {
  it('USD -> BS: multiplica por la tasa', () => {
    expect(convertirMontoRawEntreMonedas('1', 'BS', 50)).toBe('50')
  })

  it('BS -> USD: divide por la tasa', () => {
    expect(convertirMontoRawEntreMonedas('50', 'USD', 50)).toBe('1')
  })

  it('precision: BS -> USD sin redondeo prematuro preserva decimales no terminantes', () => {
    // Bs 4.99 / 500 = 0.00998 exacto (no debe perder precision con toFixed intermedio)
    expect(convertirMontoRawEntreMonedas('4.99', 'USD', 500)).toBe('0.00998')
  })

  it('string vacio: se devuelve sin cambios', () => {
    expect(convertirMontoRawEntreMonedas('', 'BS', 50)).toBe('')
  })

  it('valor no numerico: se devuelve sin cambios', () => {
    expect(convertirMontoRawEntreMonedas('abc', 'BS', 50)).toBe('abc')
  })

  it('tasa invalida (<=0): se devuelve sin cambios', () => {
    expect(convertirMontoRawEntreMonedas('10', 'BS', 0)).toBe('10')
  })
})
