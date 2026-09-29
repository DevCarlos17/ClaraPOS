import {
  aplicarDecisionNivel,
  actualizarPvpInput,
  actualizarMargenInput,
  construirPvpNiveles,
  costoTieneCambioSignificativo,
  getCostoNuevoUsdForLinea,
  type PvpNivelUI,
} from '../compra-pvp-decision'

/**
 * Casos de referencia extraidos 1:1 de `compra-form.tsx` L667-899
 * (`getCostoNuevoUsdForLinea`, `construirPvpNiveles`, el branch por-nivel de
 * `handleDecisionNivel`, `handlePvpNivelInputChange`,
 * `handleMargenNivelInputChange`) — ver design.md decision #3 y tasks.md 4a.1.
 * Los valores esperados se calcularon manualmente replicando la formula real
 * (no re-implementando la logica bajo prueba) para garantizar paridad byte-a-byte.
 */

function nivel(overrides: Partial<PvpNivelUI> = {}): PvpNivelUI {
  return {
    orden: 1,
    nombre: 'PVP',
    campo: 'precio_venta_usd',
    pvp_actual_usd: 10,
    pvp_input: '10.00',
    margen_input: '25.0',
    violado: false,
    decision: 'pendiente',
    margen_si_mantiene_pvp: '25.0',
    ...overrides,
  }
}

describe('getCostoNuevoUsdForLinea', () => {
  it('USD sin tasa paralela: costo_input / factor', () => {
    const result = getCostoNuevoUsdForLinea(
      { costo_input: 10, factor: 2 },
      { moneda: 'USD', usaTasaParalela: false, tasaInternaNum: 0, tasaFacturaNum: 0 }
    )
    expect(result).toBe(5)
  })

  it('USD sin factor (factor=0 se trata como 1)', () => {
    const result = getCostoNuevoUsdForLinea(
      { costo_input: 7, factor: 0 },
      { moneda: 'USD', usaTasaParalela: false, tasaInternaNum: 0, tasaFacturaNum: 0 }
    )
    expect(result).toBe(7)
  })

  it('USD con tasa paralela: costoFacturaUsd * tasaFactura / tasaInterna', () => {
    const result = getCostoNuevoUsdForLinea(
      { costo_input: 1, factor: 1 },
      { moneda: 'USD', usaTasaParalela: true, tasaInternaNum: 500, tasaFacturaNum: 1000 }
    )
    // costoFacturaUsd = 1 -> 1 * 1000 / 500 = 2
    expect(result).toBe(2)
  })

  it('USD con tasa paralela pero tasaInterna=0: no aplica conversion (guard tasaInternaNum>0)', () => {
    const result = getCostoNuevoUsdForLinea(
      { costo_input: 3, factor: 1 },
      { moneda: 'USD', usaTasaParalela: true, tasaInternaNum: 0, tasaFacturaNum: 1000 }
    )
    expect(result).toBe(3)
  })

  it('BS sin tasa paralela: costo_input / tasaFacturaNum / factor', () => {
    const result = getCostoNuevoUsdForLinea(
      { costo_input: 500, factor: 1 },
      { moneda: 'BS', usaTasaParalela: false, tasaInternaNum: 0, tasaFacturaNum: 100 }
    )
    expect(result).toBe(5)
  })

  it('BS con tasa paralela: usa tasaInternaNum como tasa contable', () => {
    const result = getCostoNuevoUsdForLinea(
      { costo_input: 1000, factor: 2 },
      { moneda: 'BS', usaTasaParalela: true, tasaInternaNum: 500, tasaFacturaNum: 100 }
    )
    // tasaContable=500 -> 1000/500/2 = 1
    expect(result).toBe(1)
  })

  it('BS con tasaContable=0: retorna 0 (guard division por cero)', () => {
    const result = getCostoNuevoUsdForLinea(
      { costo_input: 100, factor: 1 },
      { moneda: 'BS', usaTasaParalela: false, tasaInternaNum: 0, tasaFacturaNum: 0 }
    )
    expect(result).toBe(0)
  })
})

describe('costoTieneCambioSignificativo', () => {
  it('USD: diferencia menor a 0.001 en Bs -> sin cambio (false)', () => {
    // toBs(10) - toBs(10.0000001) con tasaFactura=100 -> diff 0.00001 Bs < 0.001
    const result = costoTieneCambioSignificativo(10, 10.0000001, { moneda: 'USD', tasaFacturaNum: 100 })
    expect(result).toBe(false)
  })

  it('USD: diferencia mayor o igual a 0.001 en Bs -> hay cambio (true)', () => {
    // diff 0.01 USD * tasa 100 = 1 Bs >= 0.001
    const result = costoTieneCambioSignificativo(10.01, 10, { moneda: 'USD', tasaFacturaNum: 100 })
    expect(result).toBe(true)
  })

  it('USD sin tasaFacturaNum (0): compara el valor USD directo', () => {
    const result = costoTieneCambioSignificativo(10.01, 10, { moneda: 'USD', tasaFacturaNum: 0 })
    // diff = 0.01 >= 0.001 -> true
    expect(result).toBe(true)
  })

  it('BS: compara directamente sin conversion', () => {
    const result = costoTieneCambioSignificativo(500.0005, 500, { moneda: 'BS', tasaFacturaNum: 100 })
    expect(result).toBe(false)
  })

  it('BS: diferencia significativa -> true', () => {
    const result = costoTieneCambioSignificativo(505, 500, { moneda: 'BS', tasaFacturaNum: 100 })
    expect(result).toBe(true)
  })

  it('costo identico -> false (moneda USD)', () => {
    const result = costoTieneCambioSignificativo(10, 10, { moneda: 'USD', tasaFacturaNum: 100 })
    expect(result).toBe(false)
  })
})

describe('construirPvpNiveles', () => {
  it('un nivel, USD, sin violacion: pvp_input y margen_input formateados, decision pendiente', () => {
    const result = construirPvpNiveles(
      { costo_input: 5, factor: 1, precio_venta_usd: '10', precio_mayor_usd: '0', precio_especial_usd: '0' },
      {
        niveles: [{ orden: 1, nombre: 'PVP' }],
        moneda: 'USD',
        usaTasaParalela: false,
        tasaInternaNum: 0,
        tasaFacturaNum: 0,
      }
    )
    // costoNuevoUsd = 5, pvpActual=10 -> margen = (10-5)/5*100 = 100.0
    expect(result).toEqual([
      {
        orden: 1,
        nombre: 'PVP',
        campo: 'precio_venta_usd',
        pvp_actual_usd: 10,
        pvp_input: '10.00',
        margen_input: '100.0',
        violado: false,
        decision: 'pendiente',
        margen_si_mantiene_pvp: '100.0',
      },
    ])
  })

  it('un nivel, USD, con violacion: costo nuevo supera el pvp actual', () => {
    const result = construirPvpNiveles(
      { costo_input: 15, factor: 1, precio_venta_usd: '10', precio_mayor_usd: '0', precio_especial_usd: '0' },
      {
        niveles: [{ orden: 1, nombre: 'PVP' }],
        moneda: 'USD',
        usaTasaParalela: false,
        tasaInternaNum: 0,
        tasaFacturaNum: 0,
      }
    )
    expect(result[0].violado).toBe(true)
    // margen = (10-15)/15*100 = -33.3
    expect(result[0].margen_input).toBe('-33.3')
  })

  it('multi-nivel (3 niveles), mapea orden -> campo correctamente', () => {
    const result = construirPvpNiveles(
      {
        costo_input: 5,
        factor: 1,
        precio_venta_usd: '10',
        precio_mayor_usd: '8',
        precio_especial_usd: '6',
      },
      {
        niveles: [
          { orden: 1, nombre: 'PVP' },
          { orden: 2, nombre: 'Mayor' },
          { orden: 3, nombre: 'Especial' },
        ],
        moneda: 'USD',
        usaTasaParalela: false,
        tasaInternaNum: 0,
        tasaFacturaNum: 0,
      }
    )
    expect(result.map((n) => n.campo)).toEqual([
      'precio_venta_usd',
      'precio_mayor_usd',
      'precio_especial_usd',
    ])
    expect(result.map((n) => n.pvp_actual_usd)).toEqual([10, 8, 6])
    // nivel 3 (especial 6) violado por costo 5? no, 5 <= 6+0.0001 -> false
    expect(result.map((n) => n.violado)).toEqual([false, false, false])
  })

  it('BS: pvp_input se muestra convertido a Bs (pvp_actual_usd * tasaFacturaNum)', () => {
    const result = construirPvpNiveles(
      { costo_input: 500, factor: 1, precio_venta_usd: '10', precio_mayor_usd: '0', precio_especial_usd: '0' },
      {
        niveles: [{ orden: 1, nombre: 'PVP' }],
        moneda: 'BS',
        usaTasaParalela: false,
        tasaInternaNum: 0,
        tasaFacturaNum: 100,
      }
    )
    // costoNuevoUsd = 500/100/1 = 5 ; pvp_input = 10*100 = 1000.00
    expect(result[0].pvp_input).toBe('1000.00')
    expect(result[0].margen_input).toBe('100.0')
  })
})

describe('aplicarDecisionNivel', () => {
  it('decision pendiente: solo actualiza el campo decision, resto intacto', () => {
    const n = nivel({ pvp_input: '10.00', margen_input: '25.0' })
    const result = aplicarDecisionNivel(n, 'pendiente', {
      costoNuevoUsd: 8,
      costoUsdActual: 8,
      moneda: 'USD',
      tasaFacturaNum: 0,
    })
    expect(result).toEqual({ ...n, decision: 'pendiente' })
  })

  it('decision manual: solo actualiza el campo decision, resto intacto', () => {
    const n = nivel({ pvp_input: '10.00', margen_input: '25.0' })
    const result = aplicarDecisionNivel(n, 'manual', {
      costoNuevoUsd: 8,
      costoUsdActual: 8,
      moneda: 'USD',
      tasaFacturaNum: 0,
    })
    expect(result).toEqual({ ...n, decision: 'manual' })
  })

  it('mantener_pvp, USD: pvp_input = pvp_actual_usd, margen_input = margen_si_mantiene_pvp', () => {
    const n = nivel({ pvp_actual_usd: 12, margen_si_mantiene_pvp: '50.0' })
    const result = aplicarDecisionNivel(n, 'mantener_pvp', {
      costoNuevoUsd: 8,
      costoUsdActual: 10,
      moneda: 'USD',
      tasaFacturaNum: 0,
    })
    expect(result.decision).toBe('mantener_pvp')
    expect(result.pvp_input).toBe('12.00')
    expect(result.margen_input).toBe('50.0')
  })

  it('mantener_pvp, BS: pvp_input convertido a Bs', () => {
    const n = nivel({ pvp_actual_usd: 12, margen_si_mantiene_pvp: '50.0' })
    const result = aplicarDecisionNivel(n, 'mantener_pvp', {
      costoNuevoUsd: 8,
      costoUsdActual: 10,
      moneda: 'BS',
      tasaFacturaNum: 100,
    })
    expect(result.pvp_input).toBe('1200.00')
  })

  it('mantener_margen, USD: recalcula pvp desde el margen original (costoUsdActual)', () => {
    // costoUsdActual=10, pvp_actual_usd=15 -> margenOriginal = (15-10)/10*100 = 50.0
    // costoNuevoUsd=20 -> pvpProyectado = max(20, 20*1.5) = 30
    const n = nivel({ pvp_actual_usd: 15 })
    const result = aplicarDecisionNivel(n, 'mantener_margen', {
      costoNuevoUsd: 20,
      costoUsdActual: 10,
      moneda: 'USD',
      tasaFacturaNum: 0,
    })
    expect(result.decision).toBe('mantener_margen')
    expect(result.margen_input).toBe('50.0')
    expect(result.pvp_input).toBe('30.00')
  })

  it('mantener_margen con costoUsdActual=0: margenOriginal cae a 0 (guard)', () => {
    const n = nivel({ pvp_actual_usd: 15 })
    const result = aplicarDecisionNivel(n, 'mantener_margen', {
      costoNuevoUsd: 20,
      costoUsdActual: 0,
      moneda: 'USD',
      tasaFacturaNum: 0,
    })
    expect(result.margen_input).toBe('0.0')
    // pvpProyectado = max(20, 20*1.0) = 20
    expect(result.pvp_input).toBe('20.00')
  })

  it('mantener_margen, BS: pvp_input convertido a Bs', () => {
    const n = nivel({ pvp_actual_usd: 15 })
    const result = aplicarDecisionNivel(n, 'mantener_margen', {
      costoNuevoUsd: 20,
      costoUsdActual: 10,
      moneda: 'BS',
      tasaFacturaNum: 100,
    })
    // pvpUsd=30 -> pvpDisplay = 30*100=3000.00
    expect(result.pvp_input).toBe('3000.00')
  })
})

describe('actualizarPvpInput', () => {
  it('valor valido, USD: recalcula margen contra costoNuevoUsd', () => {
    const n = nivel()
    const result = actualizarPvpInput(n, '12.00', { costoNuevoUsd: 8, moneda: 'USD', tasaFacturaNum: 0 })
    // pvpUsd = 12, margen = (12-8)/8*100 = 50.0
    expect(result.pvp_input).toBe('12.00')
    expect(result.margen_input).toBe('50.0')
  })

  it('valor valido, BS: convierte pvp a USD antes de calcular margen', () => {
    const n = nivel()
    const result = actualizarPvpInput(n, '1200.00', { costoNuevoUsd: 8, moneda: 'BS', tasaFacturaNum: 100 })
    // pvpUsd = 1200/100 = 12, margen = (12-8)/8*100 = 50.0
    expect(result.margen_input).toBe('50.0')
  })

  it('valor invalido (NaN): solo actualiza pvp_input, margen_input intacto', () => {
    const n = nivel({ margen_input: '99.9' })
    const result = actualizarPvpInput(n, 'abc', { costoNuevoUsd: 8, moneda: 'USD', tasaFacturaNum: 0 })
    expect(result.pvp_input).toBe('abc')
    expect(result.margen_input).toBe('99.9')
  })

  it('valor negativo: solo actualiza pvp_input, margen_input intacto', () => {
    const n = nivel({ margen_input: '99.9' })
    const result = actualizarPvpInput(n, '-5', { costoNuevoUsd: 8, moneda: 'USD', tasaFacturaNum: 0 })
    expect(result.pvp_input).toBe('-5')
    expect(result.margen_input).toBe('99.9')
  })

  it('costoNuevoUsd=0: margen cae a 0.0 (guard)', () => {
    const n = nivel()
    const result = actualizarPvpInput(n, '12.00', { costoNuevoUsd: 0, moneda: 'USD', tasaFacturaNum: 0 })
    expect(result.margen_input).toBe('0.0')
  })

  it('BS sin tasaFacturaNum (0): usa el valor tipeado sin convertir', () => {
    const n = nivel()
    const result = actualizarPvpInput(n, '12.00', { costoNuevoUsd: 8, moneda: 'BS', tasaFacturaNum: 0 })
    // pvpUsd = 12 (fallback sin convertir), margen = (12-8)/8*100 = 50.0
    expect(result.margen_input).toBe('50.0')
  })
})

describe('actualizarMargenInput', () => {
  it('valor valido, USD: recalcula pvp desde costoNuevoUsd', () => {
    const n = nivel()
    const result = actualizarMargenInput(n, '50.0', { costoNuevoUsd: 8, moneda: 'USD', tasaFacturaNum: 0 })
    // pvpUsd = 8 * 1.5 = 12
    expect(result.margen_input).toBe('50.0')
    expect(result.pvp_input).toBe('12.00')
  })

  it('valor valido, BS: pvp resultante convertido a Bs', () => {
    const n = nivel()
    const result = actualizarMargenInput(n, '50.0', { costoNuevoUsd: 8, moneda: 'BS', tasaFacturaNum: 100 })
    // pvpUsd = 12 -> pvpDisplay = 1200.00
    expect(result.pvp_input).toBe('1200.00')
  })

  it('valor invalido (NaN): solo actualiza margen_input, pvp_input intacto', () => {
    const n = nivel({ pvp_input: '99.99' })
    const result = actualizarMargenInput(n, 'abc', { costoNuevoUsd: 8, moneda: 'USD', tasaFacturaNum: 0 })
    expect(result.margen_input).toBe('abc')
    expect(result.pvp_input).toBe('99.99')
  })

  it('margen negativo que proyecta pvp negativo: clamp a 0 via Math.max', () => {
    const n = nivel()
    const result = actualizarMargenInput(n, '-150', { costoNuevoUsd: 8, moneda: 'USD', tasaFacturaNum: 0 })
    // pvpUsd = 8 * (1 - 1.5) = -4 -> Math.max(0, -4) = 0
    expect(result.pvp_input).toBe('0.00')
  })
})
