// `splitEgresosArqueo` — funcion pura que separa los egresos manuales de efectivo
// (movimientos_metodo_cobro, mov_tipo='EGRESO') en 3 buckets para la Card "Arqueo
// Teorico": Devoluciones (NC), Vueltos y Retiros (todo lo demas: EGRESO_MANUAL,
// EGRESO_TESORERIA, AVANCE, PRESTAMO, PAGO_PROVEEDOR). Clasifica por origen
// (ORIGENES_DEVOLUCION_NC), no por entryPoint — asi cuando Fase 2 habilite
// devoluciones de NC desde el modulo administrativo, alcanza con agregar su
// origen a esa lista. Cero mocks — logica pura. Invariante: retiros +
// devolucionesNc + vueltos == egresos totales (mismo total que antes del split).
import { splitEgresosArqueo, ORIGENES_DEVOLUCION_NC, type MovimientoManualItem } from '../cuadre-arqueo-teorico-model'

function mov(overrides: Partial<MovimientoManualItem> = {}): MovimientoManualItem {
  return {
    metodo_tipo: 'EFECTIVO',
    metodo_moneda: 'USD',
    mov_tipo: 'EGRESO',
    origen: 'EGRESO_MANUAL',
    total: 0,
    ...overrides,
  }
}

describe('splitEgresosArqueo — clasifica egresos de efectivo en Devoluciones (NC) / Retiros / Vueltos', () => {
  it('un egreso origen=NCR va a devolucionesNcUsd, no a retirosUsd', () => {
    const result = splitEgresosArqueo([mov({ origen: 'NCR', total: 50 })])
    expect(result.devolucionesNcUsd).toBe(50)
    expect(result.retirosUsd).toBe(0)
    expect(result.vueltosUsd).toBe(0)
  })

  it('EGRESO_MANUAL, EGRESO_TESORERIA, AVANCE, PRESTAMO y PAGO_PROVEEDOR siguen sumando a retirosUsd', () => {
    const result = splitEgresosArqueo([
      mov({ origen: 'EGRESO_MANUAL', total: 10 }),
      mov({ origen: 'EGRESO_TESORERIA', total: 20 }),
      mov({ origen: 'AVANCE', total: 30 }),
      mov({ origen: 'PRESTAMO', total: 40 }),
      mov({ origen: 'PAGO_PROVEEDOR', total: 5 }),
    ])
    expect(result.retirosUsd).toBe(105)
    expect(result.devolucionesNcUsd).toBe(0)
  })

  it('VUELTO sigue separado en vueltosUsd, no se mezcla con retiros ni devoluciones', () => {
    const result = splitEgresosArqueo([mov({ origen: 'VUELTO', total: 7 })])
    expect(result.vueltosUsd).toBe(7)
    expect(result.retirosUsd).toBe(0)
    expect(result.devolucionesNcUsd).toBe(0)
  })

  it('separa por moneda: USD (metodo_moneda != BS) vs Bs nativo (metodo_moneda == BS)', () => {
    const result = splitEgresosArqueo([
      mov({ origen: 'NCR', metodo_moneda: 'USD', total: 15 }),
      mov({ origen: 'NCR', metodo_moneda: 'BS', total: 600 }),
      mov({ origen: 'EGRESO_MANUAL', metodo_moneda: 'USD', total: 8 }),
      mov({ origen: 'EGRESO_MANUAL', metodo_moneda: 'BS', total: 300 }),
    ])
    expect(result.devolucionesNcUsd).toBe(15)
    expect(result.devolucionesNcBsNativo).toBe(600)
    expect(result.retirosUsd).toBe(8)
    expect(result.retirosBsNativo).toBe(300)
  })

  it('ignora movimientos no-efectivo (metodo_tipo != EFECTIVO) y no-egreso (mov_tipo != EGRESO)', () => {
    const result = splitEgresosArqueo([
      mov({ metodo_tipo: 'TRANSFERENCIA', origen: 'NCR', total: 999 }),
      mov({ mov_tipo: 'INGRESO', origen: 'INGRESO_MANUAL', total: 999 }),
    ])
    expect(result.devolucionesNcUsd).toBe(0)
    expect(result.retirosUsd).toBe(0)
    expect(result.vueltosUsd).toBe(0)
  })

  it('invariante: retiros + devolucionesNc + vueltos == suma total de egresos de efectivo (sin cambio de total)', () => {
    const movimientos = [
      mov({ origen: 'NCR', total: 50 }),
      mov({ origen: 'EGRESO_MANUAL', total: 10 }),
      mov({ origen: 'AVANCE', total: 30 }),
      mov({ origen: 'VUELTO', total: 7 }),
    ]
    const totalEgresos = movimientos.reduce((s, m) => s + m.total, 0)
    const result = splitEgresosArqueo(movimientos)
    expect(result.retirosUsd + result.devolucionesNcUsd + result.vueltosUsd).toBe(totalEgresos)
  })

  it('escenario vacio: todo en 0', () => {
    const result = splitEgresosArqueo([])
    expect(result).toEqual({
      retirosUsd: 0,
      retirosBsNativo: 0,
      devolucionesNcUsd: 0,
      devolucionesNcBsNativo: 0,
      vueltosUsd: 0,
      vueltosBsNativo: 0,
    })
  })

  it('ORIGENES_DEVOLUCION_NC incluye NCR (marcador actual del reembolso de efectivo por NC)', () => {
    expect(ORIGENES_DEVOLUCION_NC).toContain('NCR')
  })
})
