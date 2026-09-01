import {
  calcularPrecioPreservandoMargen,
  calcularViolacionCostoPvp,
} from '../producto-precio-gating'

describe('calcularPrecioPreservandoMargen', () => {
  it('calcula el PVP proyectado preservando el margen configurado (costo=10, margen=50%)', () => {
    expect(calcularPrecioPreservandoMargen(10, 50)).toBe(15)
  })

  it('calcula el PVP proyectado con un margen distinto (costo=20, margen=25%)', () => {
    expect(calcularPrecioPreservandoMargen(20, 25)).toBe(25)
  })

  it('nunca retorna un valor negativo aunque el margen sea muy negativo', () => {
    expect(calcularPrecioPreservandoMargen(10, -200)).toBe(0)
  })
})

describe('calcularViolacionCostoPvp', () => {
  it('marca violacion cuando el nuevo costo supera el PVP actual', () => {
    expect(calcularViolacionCostoPvp(12, 10)).toBe(true)
  })

  it('marca violacion cuando el nuevo costo iguala el PVP actual (regla #7: costo >= pvp)', () => {
    expect(calcularViolacionCostoPvp(10, 10)).toBe(true)
  })

  it('no marca violacion cuando el nuevo costo es menor al PVP actual', () => {
    expect(calcularViolacionCostoPvp(8, 10)).toBe(false)
  })
})
