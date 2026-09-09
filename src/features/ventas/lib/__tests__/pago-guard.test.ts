import { evaluarPagoPendiente } from '../pago-guard'

describe('evaluarPagoPendiente (fix pos-cobro-checkout-guards — R5/R6)', () => {
  it('R5: montoStr sin agregar (no vacio) bloquea con ABONO_SIN_AGREGAR, aunque no haya metodo', () => {
    const resultado = evaluarPagoPendiente({ metodoId: '', montoStr: '25.00', referencia: '' })
    expect(resultado).toEqual({ blocked: true, reason: 'ABONO_SIN_AGREGAR' })
  })

  it('R5: referencia sin agregar (no vacia) bloquea con ABONO_SIN_AGREGAR, aunque no haya monto', () => {
    const resultado = evaluarPagoPendiente({ metodoId: '', montoStr: '', referencia: 'REF-001' })
    expect(resultado).toEqual({ blocked: true, reason: 'ABONO_SIN_AGREGAR' })
  })

  it('R5 tiene prioridad sobre R6: metodo seleccionado + montoStr sin agregar → ABONO_SIN_AGREGAR, no METODO_SIN_MONTO', () => {
    const resultado = evaluarPagoPendiente({ metodoId: 'metodo-1', montoStr: '10.00', referencia: '' })
    expect(resultado).toEqual({ blocked: true, reason: 'ABONO_SIN_AGREGAR' })
  })

  it('R6: metodo seleccionado sin monto ingresado bloquea con METODO_SIN_MONTO', () => {
    const resultado = evaluarPagoPendiente({ metodoId: 'metodo-1', montoStr: '', referencia: '' })
    expect(resultado).toEqual({ blocked: true, reason: 'METODO_SIN_MONTO' })
  })

  it('estado limpio (todo vacio, sin metodo ni monto): no bloquea', () => {
    const resultado = evaluarPagoPendiente({ metodoId: '', montoStr: '', referencia: '' })
    expect(resultado).toEqual({ blocked: false })
  })

  it('estado limpio tras commit exitoso (handleAddPago limpia metodoId/montoStr/referencia): no bloquea', () => {
    // Simula el estado post-commit: los 3 campos vuelven a '' tras handleAddPago()
    const resultado = evaluarPagoPendiente({ metodoId: '', montoStr: '', referencia: '' })
    expect(resultado.blocked).toBe(false)
  })

  it('metodo + monto + referencia todos con valor (a medio ingresar, sin commitear): bloquea con ABONO_SIN_AGREGAR', () => {
    // El predicado detecta "hay datos a medio ingresar que se perderian" —
    // aunque el formulario luzca "completo", el cajero debe presionar "+"
    // para commitearlo antes de poder procesar o cambiar de modo.
    const resultado = evaluarPagoPendiente({ metodoId: 'metodo-1', montoStr: '50.00', referencia: 'REF' })
    expect(resultado).toEqual({ blocked: true, reason: 'ABONO_SIN_AGREGAR' })
  })
})
