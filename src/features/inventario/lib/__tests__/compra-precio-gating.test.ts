import Decimal from 'decimal.js'
import {
  calcularNoActualizarPvp,
  calcularMargenSiSeMantienePvp,
  calcularPvpSiSeMantieneMargen,
  clasificarCasoLinea,
  debeMostrarInfoPvpEnResumen,
  lineaTieneDecisionBloqueante,
  resolverAccionesLineaCompra,
  resolverCostoAEscribir,
  type NivelDecisionUI,
} from '../compra-precio-gating'

describe('calcularNoActualizarPvp', () => {
  it('mantiene el pvp cuando no se edito y no hay nivel violado', () => {
    expect(calcularNoActualizarPvp(false, false)).toBe(true)
  })

  it('actualiza el pvp cuando el usuario esta editando', () => {
    expect(calcularNoActualizarPvp(true, false)).toBe(false)
  })

  it('actualiza el pvp cuando hay un nivel violado aunque no este editando', () => {
    expect(calcularNoActualizarPvp(false, true)).toBe(false)
  })

  it('actualiza el pvp cuando esta editando y ademas hay nivel violado', () => {
    expect(calcularNoActualizarPvp(true, true)).toBe(false)
  })
})

describe('debeMostrarInfoPvpEnResumen', () => {
  it('no muestra info cuando no hubo cambio de costo ni edicion de pvp', () => {
    expect(debeMostrarInfoPvpEnResumen(false, false)).toBe(false)
  })

  it('muestra info cuando hubo cambio de costo aunque no se edito el pvp', () => {
    expect(debeMostrarInfoPvpEnResumen(true, false)).toBe(true)
  })

  it('muestra info cuando se edito el pvp aunque no hubo cambio de costo', () => {
    expect(debeMostrarInfoPvpEnResumen(false, true)).toBe(true)
  })

  it('muestra info cuando hubo cambio de costo y edicion de pvp', () => {
    expect(debeMostrarInfoPvpEnResumen(true, true)).toBe(true)
  })
})

describe('resolverAccionesLineaCompra', () => {
  it('linea sin edicion: no actualiza costo, no actualiza pvp, no audita (sin cambio de costo, noActualizarPvp=true)', () => {
    expect(resolverAccionesLineaCompra(false, true)).toEqual({
      actualizarCosto: false,
      actualizarPvp: false,
      registrarAuditoria: false,
    })
  })

  it('linea sin edicion con noActualizarPvp=undefined: mismo resultado que con true', () => {
    expect(resolverAccionesLineaCompra(false, undefined)).toEqual({
      actualizarCosto: false,
      actualizarPvp: false,
      registrarAuditoria: false,
    })
  })

  it('solo cambio de costo, usuario mantiene el pvp actual: actualiza costo y audita, pero no actualiza pvp', () => {
    expect(resolverAccionesLineaCompra(true, true)).toEqual({
      actualizarCosto: true,
      actualizarPvp: false,
      registrarAuditoria: true,
    })
  })

  it('solo edicion de pvp, sin cambio de costo: persiste el pvp y audita, sin tocar el costo', () => {
    expect(resolverAccionesLineaCompra(false, false)).toEqual({
      actualizarCosto: false,
      actualizarPvp: true,
      registrarAuditoria: true,
    })
  })

  it('cambio de costo y edicion de pvp: actualiza ambos y audita', () => {
    expect(resolverAccionesLineaCompra(true, false)).toEqual({
      actualizarCosto: true,
      actualizarPvp: true,
      registrarAuditoria: true,
    })
  })
})

describe('resolverCostoAEscribir', () => {
  it('preserva el costo actual EXACTO cuando el costo no cambio, aunque costoSistema haya sufrido drift por tasa paralela (edicion de PVP sin cambio de costo)', () => {
    // Escenario real: costoUnitarioUsd=10 * tasaFactura=37.1234 / tasaInterna=37.1233
    // produce un costoSistema con drift de punto flotante en el 5to decimal,
    // aunque el usuario NO toco "Nuevo Costo".
    const costoSistemaConDrift = 10.0000269441
    const costoActualExacto = 10
    expect(resolverCostoAEscribir(false, costoSistemaConDrift, costoActualExacto)).toBe(costoActualExacto)
  })

  it('usa costoSistema cuando el costo si cambio (comportamiento existente, sin regresion)', () => {
    expect(resolverCostoAEscribir(true, 15.5, 12.34)).toBe(15.5)
  })
})

describe('calcularMargenSiSeMantienePvp', () => {
  it('caso rentable: costo baja, margen sube', () => {
    const margen = calcularMargenSiSeMantienePvp(new Decimal(10), new Decimal(15))
    expect(margen.toString()).toBe('50')
  })

  it('caso con perdida: costo nuevo supera el pvp actual, margen negativo permitido', () => {
    const margen = calcularMargenSiSeMantienePvp(new Decimal(20), new Decimal(15))
    expect(margen.toString()).toBe('-25')
  })

  it('costo nuevo cero: retorna Decimal(0) en vez de dividir por cero', () => {
    const margen = calcularMargenSiSeMantienePvp(new Decimal(0), new Decimal(15))
    expect(margen.equals(new Decimal(0))).toBe(true)
  })

  it('precision-8: division no exacta se preserva como Decimal sin redondeo prematuro', () => {
    // (4-3)/3*100 = 100/3 = 33.333333... — no debe truncarse a un float de 2 decimales.
    const margen = calcularMargenSiSeMantienePvp(new Decimal(3), new Decimal(4))
    expect(margen.toFixed(8)).toBe('33.33333333')
    expect(margen).toBeInstanceOf(Decimal)
  })
})

describe('calcularPvpSiSeMantieneMargen', () => {
  it('margen positivo: proyecta el pvp por encima del costo nuevo', () => {
    const pvp = calcularPvpSiSeMantieneMargen(new Decimal(10), new Decimal(50))
    expect(pvp.toString()).toBe('15')
  })

  it('margen cero: el pvp proyectado iguala al costo nuevo', () => {
    const pvp = calcularPvpSiSeMantieneMargen(new Decimal(10), new Decimal(0))
    expect(pvp.toString()).toBe('10')
  })

  it('boundary max(): margen negativo que haria caer el pvp bajo el costo nuevo se clampa al costo nuevo', () => {
    // costoNuevo * (1 + (-150)/100) = costoNuevo * -0.5 = -5, por debajo de costoNuevo=10 → max() clampa a 10.
    const pvp = calcularPvpSiSeMantieneMargen(new Decimal(10), new Decimal(-150))
    expect(pvp.toString()).toBe('10')
  })

  it('round-trip exacto sin drift: encadenar margen→pvp reproduce el pvp original', () => {
    const margen = calcularMargenSiSeMantienePvp(new Decimal(10), new Decimal(15))
    const pvp = calcularPvpSiSeMantieneMargen(new Decimal(10), margen)
    expect(pvp.toString()).toBe('15')
  })
})

describe('clasificarCasoLinea', () => {
  it('caso A: ningun nivel violado', () => {
    expect(clasificarCasoLinea([{ violado: false }, { violado: false }, { violado: false }])).toBe('A')
  })

  it('caso B: un nivel violado entre varios', () => {
    expect(clasificarCasoLinea([{ violado: false }, { violado: false }, { violado: true }])).toBe('B')
  })

  it('caso B: todos los niveles violados', () => {
    expect(clasificarCasoLinea([{ violado: true }, { violado: true }])).toBe('B')
  })

  it('edge de un solo nivel (empresa sin niveles configurados): violado=false → A', () => {
    expect(clasificarCasoLinea([{ violado: false }])).toBe('A')
  })

  it('edge de un solo nivel (empresa sin niveles configurados): violado=true → B', () => {
    expect(clasificarCasoLinea([{ violado: true }])).toBe('B')
  })
})

describe('lineaTieneDecisionBloqueante', () => {
  const nivelResuelto = (decision: NivelDecisionUI['decision'], pvp_input = '15.00'): NivelDecisionUI => ({
    violado: false,
    decision,
    pvp_input,
  })

  it('sin cambio de costo: nunca bloquea, incluso con nivel pendiente', () => {
    expect(lineaTieneDecisionBloqueante(false, [nivelResuelto('pendiente', '')])).toBe(false)
  })

  it('con cambio de costo y un nivel pendiente: bloquea', () => {
    expect(lineaTieneDecisionBloqueante(true, [nivelResuelto('mantener_pvp'), nivelResuelto('pendiente')])).toBe(true)
  })

  it('con cambio de costo, decision manual con pvp_input vacio: bloquea', () => {
    expect(lineaTieneDecisionBloqueante(true, [nivelResuelto('manual', '')])).toBe(true)
  })

  it('con cambio de costo, decision mantener_margen con pvp_input <= 0: bloquea', () => {
    expect(lineaTieneDecisionBloqueante(true, [nivelResuelto('mantener_margen', '0')])).toBe(true)
  })

  it('con cambio de costo, decision mantener_margen con pvp_input negativo: bloquea', () => {
    expect(lineaTieneDecisionBloqueante(true, [nivelResuelto('mantener_margen', '-5')])).toBe(true)
  })

  it('con cambio de costo, todos los niveles resueltos con pvp valido: no bloquea', () => {
    expect(
      lineaTieneDecisionBloqueante(true, [
        nivelResuelto('mantener_pvp'),
        nivelResuelto('mantener_margen', '18.50'),
        nivelResuelto('manual', '22.00'),
      ])
    ).toBe(false)
  })
})
