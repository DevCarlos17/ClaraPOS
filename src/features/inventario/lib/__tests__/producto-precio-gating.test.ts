import Decimal from 'decimal.js'
import {
  calcularPrecioPreservandoMargen,
  calcularViolacionCostoPvp,
  debeBackCalcularCosto,
  backcalcularCostoYCascada,
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

describe('debeBackCalcularCosto', () => {
  it('dispara cuando el costo esta vacio, hay margen y PVP detal cargados, y no es combo', () => {
    expect(
      debeBackCalcularCosto({ costoUsd: '', esCombo: false, margenDetalPct: '50', pvpDetalUsd: 150 })
    ).toBe(true)
  })

  it('no dispara cuando el costo ya tiene el valor "0" explicito (\'0\' no es vacio)', () => {
    expect(
      debeBackCalcularCosto({ costoUsd: '0', esCombo: false, margenDetalPct: '50', pvpDetalUsd: 150 })
    ).toBe(false)
  })

  it('no dispara cuando el margen DETAL esta ausente', () => {
    expect(
      debeBackCalcularCosto({ costoUsd: '', esCombo: false, margenDetalPct: '', pvpDetalUsd: 150 })
    ).toBe(false)
  })

  it('no dispara cuando no hay PVP ni precio final DETAL cargado', () => {
    expect(
      debeBackCalcularCosto({ costoUsd: '', esCombo: false, margenDetalPct: '50', pvpDetalUsd: 0 })
    ).toBe(false)
  })

  it('no dispara para combos aunque las demas condiciones se cumplan', () => {
    expect(
      debeBackCalcularCosto({ costoUsd: '', esCombo: true, margenDetalPct: '50', pvpDetalUsd: 150 })
    ).toBe(false)
  })
})

describe('backcalcularCostoYCascada', () => {
  it('ejemplo canonico: pvp detal 150, margen detal 50%, mayor 25%, especial 0.01% -> costo 100, mayor 125, especial 100.01', () => {
    const resultado = backcalcularCostoYCascada({
      pvpDetalUsd: new Decimal(150),
      margenDetalPct: new Decimal(50),
      margenMayorPct: new Decimal(25),
      margenEspecialPct: new Decimal(0.01),
      ultimaFuenteMayor: 'margen',
      ultimaFuenteEspecial: 'margen',
    })
    expect(resultado.costoUsd.toFixed(2)).toBe('100.00')
    expect(resultado.mayorUsd?.toFixed(2)).toBe('125.00')
    expect(resultado.especialUsd?.toFixed(2)).toBe('100.01')
  })

  it('desde precio final con IVA 16%: final 174 -> pvp intermedio 150 -> costo 100', () => {
    const pvpDesdeFinal = new Decimal(174).dividedBy(new Decimal(1).plus(new Decimal(16).dividedBy(100)))
    expect(pvpDesdeFinal.toFixed(2)).toBe('150.00')

    const resultado = backcalcularCostoYCascada({
      pvpDetalUsd: pvpDesdeFinal,
      margenDetalPct: new Decimal(50),
      margenMayorPct: new Decimal(0),
      margenEspecialPct: new Decimal(0),
      ultimaFuenteMayor: null,
      ultimaFuenteEspecial: null,
    })
    expect(resultado.costoUsd.toFixed(2)).toBe('100.00')
  })

  it('margen detal 0% -> costo iguala el pvp (sin division real)', () => {
    const resultado = backcalcularCostoYCascada({
      pvpDetalUsd: new Decimal(80),
      margenDetalPct: new Decimal(0),
      margenMayorPct: new Decimal(0),
      margenEspecialPct: new Decimal(0),
      ultimaFuenteMayor: null,
      ultimaFuenteEspecial: null,
    })
    expect(resultado.costoUsd.toFixed(2)).toBe('80.00')
  })

  it('preserva el precio tipeado a mano (ultima fuente = precio) y solo cascada el nivel en margen', () => {
    const resultado = backcalcularCostoYCascada({
      pvpDetalUsd: new Decimal(150),
      margenDetalPct: new Decimal(50),
      margenMayorPct: new Decimal(25),
      margenEspecialPct: new Decimal(10),
      ultimaFuenteMayor: 'precio',
      ultimaFuenteEspecial: 'margen',
    })
    expect(resultado.mayorUsd).toBeNull()
    expect(resultado.especialUsd?.toFixed(2)).toBe('110.00')
  })

  it('clampa defensivamente un margen de nivel negativo a 0% antes de cascadear', () => {
    const resultado = backcalcularCostoYCascada({
      pvpDetalUsd: new Decimal(150),
      margenDetalPct: new Decimal(50),
      margenMayorPct: new Decimal(-10),
      margenEspecialPct: new Decimal(0),
      ultimaFuenteMayor: 'margen',
      ultimaFuenteEspecial: null,
    })
    expect(resultado.mayorUsd?.toFixed(2)).toBe('100.00')
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
