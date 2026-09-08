import Decimal from 'decimal.js'
import {
  calcularPrecioPreservandoMargen,
  calcularViolacionCostoPvp,
  calcularCostoBsBackCalculado,
  debeExplorarCosto,
  calcularCostoDesdeNivel,
  fijarCostoYCascada,
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

describe('calcularCostoBsBackCalculado', () => {
  it('retorna null cuando la tasa es 0 (guard, sin escribir un Bs invalido)', () => {
    expect(calcularCostoBsBackCalculado(new Decimal(100), new Decimal(0))).toBeNull()
  })

  it('calcula el equivalente en Bs cuando la tasa es valida', () => {
    const bs = calcularCostoBsBackCalculado(new Decimal(100), new Decimal(40))
    expect(bs?.toFixed(2)).toBe('4000.00')
  })
})

describe('debeExplorarCosto', () => {
  it('activa exploracion cuando ambos costos (USD y Bs) estan vacios', () => {
    expect(debeExplorarCosto({ costoUsd: '', costoBs: '', costoEsPreview: false })).toBe(true)
  })

  it('no activa exploracion cuando el costo USD tiene un valor', () => {
    expect(debeExplorarCosto({ costoUsd: '100', costoBs: '', costoEsPreview: false })).toBe(false)
  })

  it('no activa exploracion cuando el costo Bs tiene un valor', () => {
    expect(debeExplorarCosto({ costoUsd: '', costoBs: '4000', costoEsPreview: false })).toBe(false)
  })

  it('se mantiene activa si el costo actual es un preview del sistema, aunque tenga valor', () => {
    expect(debeExplorarCosto({ costoUsd: '100.00', costoBs: '4000.00', costoEsPreview: true })).toBe(true)
  })
})

describe('calcularCostoDesdeNivel', () => {
  it('caso canonico sin IVA: margen 50%, pvp 150 -> costo 100', () => {
    const costo = calcularCostoDesdeNivel({ pvpUsd: new Decimal(150), margenPct: new Decimal(50) })
    expect(costo?.toFixed(2)).toBe('100.00')
  })

  it('caso canonico con IVA: pvp ya resuelto desde final (174 / 1.16 = 150), margen 50% -> costo 100', () => {
    const pvpDesdeFinal = new Decimal(174).dividedBy(new Decimal(1).plus(new Decimal(16).dividedBy(100)))
    expect(pvpDesdeFinal.toFixed(2)).toBe('150.00')

    const costo = calcularCostoDesdeNivel({ pvpUsd: pvpDesdeFinal, margenPct: new Decimal(50) })
    expect(costo?.toFixed(2)).toBe('100.00')
  })

  it('margen 0% -> costo iguala el pvp (sin division real)', () => {
    const costo = calcularCostoDesdeNivel({ pvpUsd: new Decimal(80), margenPct: new Decimal(0) })
    expect(costo?.toFixed(2)).toBe('80.00')
  })

  it('retorna null cuando el pvp es 0 (nada que calcular aun)', () => {
    expect(calcularCostoDesdeNivel({ pvpUsd: new Decimal(0), margenPct: new Decimal(50) })).toBeNull()
  })

  it('retorna null cuando el pvp es negativo', () => {
    expect(calcularCostoDesdeNivel({ pvpUsd: new Decimal(-10), margenPct: new Decimal(50) })).toBeNull()
  })

  it('retorna null con margen -100% (divisor 0): no produce Infinity', () => {
    expect(calcularCostoDesdeNivel({ pvpUsd: new Decimal(150), margenPct: new Decimal(-100) })).toBeNull()
  })

  it('retorna null con margen < -100% (divisor negativo): no produce costo negativo', () => {
    expect(calcularCostoDesdeNivel({ pvpUsd: new Decimal(150), margenPct: new Decimal(-150) })).toBeNull()
  })

  it('calcula normalmente con un margen negativo mayor a -100% (divisor positivo)', () => {
    const costo = calcularCostoDesdeNivel({ pvpUsd: new Decimal(80), margenPct: new Decimal(-20) })
    expect(costo?.toFixed(2)).toBe('100.00')
  })
})

describe('fijarCostoYCascada', () => {
  it('cascada canonica: costo 100, margen detal 50%/mayor 25%/especial 0.01% -> detal 150, mayor 125, especial 100.01', () => {
    const resultado = fijarCostoYCascada({
      costoUsd: new Decimal(100),
      margenDetalPct: new Decimal(50),
      margenMayorPct: new Decimal(25),
      margenEspecialPct: new Decimal(0.01),
    })
    expect(resultado.detalUsd.toFixed(2)).toBe('150.00')
    expect(resultado.mayorUsd.toFixed(2)).toBe('125.00')
    expect(resultado.especialUsd.toFixed(2)).toBe('100.01')
  })

  it('clampa un margen negativo a 0% antes de cascadear (nivel especial)', () => {
    const resultado = fijarCostoYCascada({
      costoUsd: new Decimal(100),
      margenDetalPct: new Decimal(50),
      margenMayorPct: new Decimal(25),
      margenEspecialPct: new Decimal(-10),
    })
    expect(resultado.especialUsd.toFixed(2)).toBe('100.00')
  })

  it('margen 0% en un nivel -> pvp de ese nivel iguala el costo', () => {
    const resultado = fijarCostoYCascada({
      costoUsd: new Decimal(100),
      margenDetalPct: new Decimal(0),
      margenMayorPct: new Decimal(25),
      margenEspecialPct: new Decimal(10),
    })
    expect(resultado.detalUsd.toFixed(2)).toBe('100.00')
  })
})
