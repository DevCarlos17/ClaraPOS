import {
  totalizarLineasCargo,
  consolidarLineasCargo,
  type LineaCargoUI,
} from '../compra-lineas-cargo'

function linea(overrides: Partial<LineaCargoUI> = {}): LineaCargoUI {
  return {
    id: 'l1',
    concepto: 'EMPAQUE',
    monto: 10,
    porcentaje_iva: 0,
    ...overrides,
  }
}

describe('totalizarLineasCargo', () => {
  it('array vacio: retorna ceros', () => {
    expect(totalizarLineasCargo([])).toEqual({ exentoUsd: 0, baseUsd: 0, ivaUsd: 0 })
  })

  it('una sola linea IVA 0%: va integra al bucket exento, base/iva en cero', () => {
    const result = totalizarLineasCargo([linea({ monto: 25, porcentaje_iva: 0 })])
    expect(result).toEqual({ exentoUsd: 25, baseUsd: 0, ivaUsd: 0 })
  })

  it('una sola linea IVA 16%: va al bucket gravable, iva calculado sobre la base', () => {
    const result = totalizarLineasCargo([linea({ monto: 100, porcentaje_iva: 16 })])
    expect(result).toEqual({ exentoUsd: 0, baseUsd: 100, ivaUsd: 16 })
  })

  it('lineas mixtas de ambos conceptos (EMPAQUE y FLETE): suma acumulada por alicuota, sin distinguir concepto', () => {
    const result = totalizarLineasCargo([
      linea({ id: 'a', concepto: 'EMPAQUE', monto: 10, porcentaje_iva: 0 }),
      linea({ id: 'b', concepto: 'FLETE', monto: 20, porcentaje_iva: 16 }),
      linea({ id: 'c', concepto: 'EMPAQUE', monto: 5, porcentaje_iva: 16 }),
    ])
    // exento: 10 (linea a)
    // base gravable: 20 + 5 = 25
    // iva: 20*0.16 + 5*0.16 = 3.2 + 0.8 = 4
    expect(result).toEqual({ exentoUsd: 10, baseUsd: 25, ivaUsd: 4 })
  })

  it('precision decimal: suma de montos no exactos en binario no sufre drift de punto flotante', () => {
    // 0.1 + 0.2 en JS puro = 0.30000000000000004 — con Decimal.js debe dar exactamente 0.3
    const result = totalizarLineasCargo([
      linea({ id: 'a', monto: 0.1, porcentaje_iva: 0 }),
      linea({ id: 'b', monto: 0.2, porcentaje_iva: 0 }),
    ])
    expect(result.exentoUsd).toBe(0.3)
  })
})

describe('consolidarLineasCargo', () => {
  it('array vacio: retorna []', () => {
    expect(consolidarLineasCargo([])).toEqual([])
  })

  it('un solo concepto con una sola linea: un grupo con base/iva de esa linea', () => {
    const result = consolidarLineasCargo([linea({ concepto: 'FLETE', monto: 50, porcentaje_iva: 16 })])
    expect(result).toEqual([{ concepto: 'FLETE', baseUsd: 50, ivaUsd: 8, totalUsd: 58 }])
  })

  it('mismo concepto, multiples lineas: se suman en un unico grupo', () => {
    const result = consolidarLineasCargo([
      linea({ id: 'a', concepto: 'EMPAQUE', monto: 5, porcentaje_iva: 16 }),
      linea({ id: 'b', concepto: 'EMPAQUE', monto: 8, porcentaje_iva: 16 }),
    ])
    // base = 5+8 = 13, iva = (5+8)*0.16 = 2.08
    expect(result).toEqual([{ concepto: 'EMPAQUE', baseUsd: 13, ivaUsd: 2.08, totalUsd: 15.08 }])
  })

  it('mismo concepto con IVA mixto (0% + 16%): base e iva se suman por separado', () => {
    const result = consolidarLineasCargo([
      linea({ id: 'a', concepto: 'FLETE', monto: 10, porcentaje_iva: 0 }),
      linea({ id: 'b', concepto: 'FLETE', monto: 20, porcentaje_iva: 16 }),
    ])
    // base = 10 + 20 = 30 (TODAS las lineas, sin importar tasa)
    // iva = 0 (de la linea 0%) + 20*0.16=3.2 (de la linea 16%) = 3.2
    expect(result).toEqual([{ concepto: 'FLETE', baseUsd: 30, ivaUsd: 3.2, totalUsd: 33.2 }])
  })

  it('ambos conceptos presentes: exactamente 2 grupos, orden EMPAQUE luego FLETE', () => {
    const result = consolidarLineasCargo([
      linea({ id: 'a', concepto: 'FLETE', monto: 10, porcentaje_iva: 0 }),
      linea({ id: 'b', concepto: 'EMPAQUE', monto: 5, porcentaje_iva: 0 }),
    ])
    expect(result).toHaveLength(2)
    expect(result.map((g) => g.concepto)).toEqual(['EMPAQUE', 'FLETE'])
  })

  it('solo un concepto tiene lineas: el otro concepto no aparece en el resultado', () => {
    const result = consolidarLineasCargo([linea({ concepto: 'EMPAQUE', monto: 5, porcentaje_iva: 0 })])
    expect(result).toHaveLength(1)
    expect(result[0]!.concepto).toBe('EMPAQUE')
  })

  it('precision decimal: monto no terminante se preserva sin redondeo prematuro', () => {
    // 100 / 3 = 33.333... — la base debe reflejar la suma exacta sin drift de float
    const tercio = 100 / 3
    const result = consolidarLineasCargo([
      linea({ id: 'a', concepto: 'FLETE', monto: tercio, porcentaje_iva: 0 }),
      linea({ id: 'b', concepto: 'FLETE', monto: tercio, porcentaje_iva: 0 }),
      linea({ id: 'c', concepto: 'FLETE', monto: tercio, porcentaje_iva: 0 }),
    ])
    // suma de los 3 tercios == 100 exacto (Decimal.js: no drift en la suma)
    expect(result[0]!.baseUsd).toBeCloseTo(100, 8)
  })
})
