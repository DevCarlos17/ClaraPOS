import Decimal from 'decimal.js'
import { clampearSafMonto } from '../clamp-saf-monto'

describe('clampearSafMonto (QA fix pos-aplicar-saf-checkout — ruido de flotante en input SAF)', () => {
  it('redondea a 2 decimales un valor con ruido de flotante (1.2999999999999998 → 1.30, no 1.29999999)', () => {
    // Reproduce el SUM() de SQLite (CAST(monto AS REAL)) que puede acumular
    // ruido de punto flotante antes de llegar al componente.
    const disponibleConRuido = 1.2999999999999998
    const resultado = clampearSafMonto(disponibleConRuido, 500)

    expect(resultado).toBe(1.3)
    expect(String(resultado)).not.toContain('9999')
  })

  it('capea el monto al tope disponible cuando el ingresado lo excede', () => {
    const resultado = clampearSafMonto('10.00', '4.50')
    expect(resultado).toBe(4.5)
  })

  it('acepta el tope cuando este tiene ruido de flotante y no lo desborda', () => {
    const topeConRuido = new Decimal(1).plus(new Decimal(0.1)).plus(new Decimal(0.1)).plus(new Decimal(1.1))
    // topeConRuido es exactamente 2.30 via Decimal — sirve de control de que
    // la funcion no reintroduce el error al redondear.
    const resultado = clampearSafMonto('2.30', topeConRuido)
    expect(resultado).toBe(2.3)
  })

  it('redondea el valor ingresado aunque venga con mas de 2 decimales', () => {
    const resultado = clampearSafMonto('1.305', '5.00')
    expect(resultado).toBe(1.31) // ROUND_HALF_UP (convencion del proyecto en currency.ts)
  })

  it('retorna 0 cuando el tope es 0', () => {
    const resultado = clampearSafMonto('3.00', 0)
    expect(resultado).toBe(0)
  })

  it('acepta Decimal como entrada directa para ambos parametros', () => {
    const resultado = clampearSafMonto(new Decimal('1.30'), new Decimal('5.00'))
    expect(resultado).toBe(1.3)
  })
})
