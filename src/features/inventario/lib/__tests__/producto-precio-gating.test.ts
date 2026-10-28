import Decimal from 'decimal.js'
import {
  calcularPrecioPreservandoMargen,
  calcularViolacionCostoPvp,
  calcularCostoBsBackCalculado,
  debeExplorarCosto,
  calcularCostoDesdeNivel,
  fijarCostoYCascada,
  calcularMargenPreservandoPvp,
  cascadaDesdeMargenManual,
  cascadaDesdePvpUsdManual,
  cascadaDesdePvpBsManual,
  hayMargenNegativoEnNiveles,
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

describe('calcularMargenPreservandoPvp', () => {
  it('retorna 0 cuando el costo es 0 (nada que derivar aun, sin division por cero)', () => {
    const margen = calcularMargenPreservandoPvp(new Decimal(0), new Decimal(150))
    expect(margen.toFixed(2)).toBe('0.00')
  })

  it('retorna 0 cuando el costo es negativo', () => {
    const margen = calcularMargenPreservandoPvp(new Decimal(-10), new Decimal(150))
    expect(margen.toFixed(2)).toBe('0.00')
  })

  it('retorna 0 cuando el pvp es 0 (nada que derivar aun)', () => {
    const margen = calcularMargenPreservandoPvp(new Decimal(100), new Decimal(0))
    expect(margen.toFixed(2)).toBe('0.00')
  })

  it('retorna 0 cuando el pvp es negativo', () => {
    const margen = calcularMargenPreservandoPvp(new Decimal(100), new Decimal(-5))
    expect(margen.toFixed(2)).toBe('0.00')
  })

  it('caso normal: costo 100, pvp 150 -> margen 50%', () => {
    const margen = calcularMargenPreservandoPvp(new Decimal(100), new Decimal(150))
    expect(margen.toFixed(2)).toBe('50.00')
  })
})

describe('cascadaDesdeMargenManual', () => {
  it('margen normal: costo 100, margen 50%, tasa 40 -> pvp$ 150, pvpBs 6000', () => {
    const resultado = cascadaDesdeMargenManual(new Decimal(100), new Decimal(50), new Decimal(40))
    expect(resultado.margenPct.toFixed(2)).toBe('50.00')
    expect(resultado.pvpUsd.toFixed(2)).toBe('150.00')
    expect(resultado.pvpBs.toFixed(2)).toBe('6000.00')
  })

  it('margen muy negativo clampea el pvp$ a 0 (y por lo tanto pvpBs a 0)', () => {
    const resultado = cascadaDesdeMargenManual(new Decimal(100), new Decimal(-200), new Decimal(40))
    expect(resultado.pvpUsd.toFixed(2)).toBe('0.00')
    expect(resultado.pvpBs.toFixed(2)).toBe('0.00')
  })

  it('margen 0% -> pvp$ iguala el costo y pvpBs es costo * tasa', () => {
    const resultado = cascadaDesdeMargenManual(new Decimal(100), new Decimal(0), new Decimal(40))
    expect(resultado.pvpUsd.toFixed(2)).toBe('100.00')
    expect(resultado.pvpBs.toFixed(2)).toBe('4000.00')
  })
})

describe('cascadaDesdePvpUsdManual', () => {
  it('pvp$ mayor al costo -> margen positivo y pvpBs consistente', () => {
    const resultado = cascadaDesdePvpUsdManual(new Decimal(100), new Decimal(150), new Decimal(40))
    expect(resultado.margenPct.toFixed(2)).toBe('50.00')
    expect(resultado.pvpUsd.toFixed(2)).toBe('150.00')
    expect(resultado.pvpBs.toFixed(2)).toBe('6000.00')
  })

  it('pvp$ menor al costo -> margen negativo (no clampea, solo informa)', () => {
    const resultado = cascadaDesdePvpUsdManual(new Decimal(100), new Decimal(80), new Decimal(40))
    expect(resultado.margenPct.toFixed(2)).toBe('-20.00')
    expect(resultado.pvpBs.toFixed(2)).toBe('3200.00')
  })

  it('pvp$ en 0 -> margen 0 via guard de calcularMargenPreservandoPvp, pvpBs 0', () => {
    const resultado = cascadaDesdePvpUsdManual(new Decimal(100), new Decimal(0), new Decimal(40))
    expect(resultado.margenPct.toFixed(2)).toBe('0.00')
    expect(resultado.pvpBs.toFixed(2)).toBe('0.00')
  })

  it('costo en 0 (div0 guard) -> margen 0 sin NaN/Infinity', () => {
    const resultado = cascadaDesdePvpUsdManual(new Decimal(0), new Decimal(150), new Decimal(40))
    expect(resultado.margenPct.toFixed(2)).toBe('0.00')
    expect(resultado.margenPct.isNaN()).toBe(false)
  })
})

describe('cascadaDesdePvpBsManual', () => {
  it('tasa normal: costo 100, pvpBs 6000, tasa 40 -> pvp$ 150, margen 50%', () => {
    const resultado = cascadaDesdePvpBsManual(new Decimal(100), new Decimal(6000), new Decimal(40))
    expect(resultado.pvpUsd.toFixed(2)).toBe('150.00')
    expect(resultado.margenPct.toFixed(2)).toBe('50.00')
    expect(resultado.pvpBs.toFixed(2)).toBe('6000.00')
  })

  it('tasa en 0 (guard de bsToUsd) -> pvp$ 0 y margen 0, sin NaN/Infinity', () => {
    const resultado = cascadaDesdePvpBsManual(new Decimal(100), new Decimal(6000), new Decimal(0))
    expect(resultado.pvpUsd.toFixed(2)).toBe('0.00')
    expect(resultado.margenPct.toFixed(2)).toBe('0.00')
    expect(resultado.pvpUsd.isNaN()).toBe(false)
    expect(resultado.margenPct.isNaN()).toBe(false)
  })

  it('round-trip $->Bs->$ preserva precision de 8 decimales (tasa no entera)', () => {
    const costo = new Decimal(100)
    const tasa = new Decimal('37.6543')
    const pvpUsdOriginal = new Decimal('123.45678901')
    const pvpBs = pvpUsdOriginal.times(tasa)

    const resultado = cascadaDesdePvpBsManual(costo, pvpBs, tasa)

    expect(resultado.pvpUsd.toFixed(8)).toBe(pvpUsdOriginal.toFixed(8))
  })

  it('costo en 0 (div0 guard) -> margen 0 sin NaN/Infinity, pvp$ sigue derivandose de Bs', () => {
    const resultado = cascadaDesdePvpBsManual(new Decimal(0), new Decimal(6000), new Decimal(40))
    expect(resultado.pvpUsd.toFixed(2)).toBe('150.00')
    expect(resultado.margenPct.toFixed(2)).toBe('0.00')
    expect(resultado.margenPct.isNaN()).toBe(false)
  })
})

describe('hayMargenNegativoEnNiveles', () => {
  it('ningun nivel negativo -> false', () => {
    expect(hayMargenNegativoEnNiveles(['50.00', '30.00', '10.00'])).toBe(false)
  })

  it('un nivel negativo (mayor) entre 3 -> true', () => {
    expect(hayMargenNegativoEnNiveles(['50.00', '-5.00', '10.00'])).toBe(true)
  })

  it('niveles ausentes (null, tenant sin mayor/especial) se ignoran, no cuentan como negativos', () => {
    expect(hayMargenNegativoEnNiveles(['-1.00', null, null])).toBe(true)
    expect(hayMargenNegativoEnNiveles(['5.00', null, null])).toBe(false)
  })

  it('string vacio (campo en blanco) no se considera negativo', () => {
    expect(hayMargenNegativoEnNiveles(['', '30.00', ''])).toBe(false)
  })
})
