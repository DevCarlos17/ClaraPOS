import {
  calcularCreditoDisponible,
  calcularDisponibleCredito,
} from '../deuda-credito-cliente'

describe('calcularCreditoDisponible', () => {
  it('solo creacion: disponible = creado cuando no hay consumo', () => {
    const resultado = calcularCreditoDisponible(700, 0)

    expect(resultado.toString()).toBe('700')
  })

  it('creacion + consumo total: disponible = 0 (no negativo)', () => {
    const resultado = calcularCreditoDisponible(700, 700)

    expect(resultado.toString()).toBe('0')
  })

  it('consumo parcial: disponible = creado - consumido', () => {
    const resultado = calcularCreditoDisponible(700, 300)

    expect(resultado.toString()).toBe('400')
  })

  it('clamp defensivo: consumido > creado nunca da negativo', () => {
    const resultado = calcularCreditoDisponible(300, 700)

    expect(resultado.toString()).toBe('0')
  })
})

describe('calcularDisponibleCredito', () => {
  it('disponible = limite - deuda', () => {
    const resultado = calcularDisponibleCredito(800, 600)

    expect(resultado.toString()).toBe('200')
  })

  it('clamp defensivo: deuda > limite nunca da negativo', () => {
    const resultado = calcularDisponibleCredito(500, 900)

    expect(resultado.toString()).toBe('0')
  })

  it('regresion: disponible NO aumenta con saldo a favor (formula aditiva rechazada)', () => {
    // Formula original rechazada: disponible = limite - deuda + creditoSAF.
    // limite=800, deuda=600, saldoAFavor=200 -> aditiva daria 400. Correcto: 200.
    const limite = 800
    const deuda = 600

    const resultado = calcularDisponibleCredito(limite, deuda)

    expect(resultado.toString()).toBe('200')
    expect(resultado.toString()).not.toBe('400')
  })

  it('disponible permanece en 0 cuando deuda == limite, sin importar saldo a favor', () => {
    // Un saldo a favor de 200 NUNCA debe destrabar credito adicional aqui.
    const resultado = calcularDisponibleCredito(800, 800)

    expect(resultado.toString()).toBe('0')
  })

  it('acepta strings decimales (PowerSync almacena NUMERIC como texto)', () => {
    const resultado = calcularDisponibleCredito('800.50', '650.25')

    expect(resultado.toString()).toBe('150.25')
  })
})
