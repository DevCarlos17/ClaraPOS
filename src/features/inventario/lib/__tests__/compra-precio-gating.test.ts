import {
  calcularNoActualizarPvp,
  debeMostrarInfoPvpEnResumen,
  resolverAccionesLineaCompra,
  resolverCostoAEscribir,
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
