// `esSalidaCaja` / `resolverConceptoSalida` — funciones puras para la tabla
// auditoria "Salidas de Caja" (bajo "Movimientos Manuales de Caja" en el cuadre).
//
// Bug fijado por este archivo (engram sdd/nc-cuadre/apply-progress): los egresos
// de efectivo por devolucion de Nota de Credito (origen='NCR', mismo origen que
// ya se etiqueta como "Devoluciones (NC)" en el Arqueo Teorico via
// ORIGENES_DEVOLUCION_NC) quedaban EXCLUIDOS de esta tabla auditoria aunque SI se
// contaban en el total de Arqueo Teorico — inconsistencia "Regla de Oro invisible".
// Este archivo agrega esos origenes ADITIVAMENTE a la lista preexistente
// (EGRESO_MANUAL, EGRESO_TESORERIA, PAGO_PROVEEDOR) sin tocar ningun total.
//
// Cero mocks — logica pura.
import {
  esSalidaCaja,
  resolverConceptoSalida,
  ORIGENES_SALIDA_CAJA,
  type SalidaCajaItem,
  type ConceptoSalidaInput,
} from '../cuadre-salidas-caja-model'
import { ORIGENES_DEVOLUCION_NC } from '../cuadre-arqueo-teorico-model'

function item(overrides: Partial<SalidaCajaItem> = {}): SalidaCajaItem {
  return { origen: 'EGRESO_MANUAL', ...overrides }
}

function conceptoInput(overrides: Partial<ConceptoSalidaInput> = {}): ConceptoSalidaInput {
  return {
    origen: 'EGRESO_MANUAL',
    concepto: null,
    destinatario: null,
    metodo_nombre: 'EFECTIVO BS',
    nro_ncr: null,
    ...overrides,
  }
}

describe('esSalidaCaja — clasifica que origenes aparecen como filas en la tabla "Salidas de Caja"', () => {
  it('EGRESO_MANUAL, EGRESO_TESORERIA y PAGO_PROVEEDOR siguen incluidos (comportamiento preexistente)', () => {
    expect(esSalidaCaja(item({ origen: 'EGRESO_MANUAL' }))).toBe(true)
    expect(esSalidaCaja(item({ origen: 'EGRESO_TESORERIA' }))).toBe(true)
    expect(esSalidaCaja(item({ origen: 'PAGO_PROVEEDOR' }))).toBe(true)
  })

  it('NCR (devolucion de NC) ahora SI esta incluido — antes quedaba excluido pese a contar en Arqueo Teorico', () => {
    expect(esSalidaCaja(item({ origen: 'NCR' }))).toBe(true)
  })

  it('VUELTO sigue excluido de esta tabla (tiene su propia tabla "Vueltos Entregados")', () => {
    expect(esSalidaCaja(item({ origen: 'VUELTO' }))).toBe(false)
  })

  it('origenes de ingreso (INGRESO_MANUAL) no aparecen en la tabla de salidas', () => {
    expect(esSalidaCaja(item({ origen: 'INGRESO_MANUAL' }))).toBe(false)
  })

  it('ORIGENES_SALIDA_CAJA reutiliza ORIGENES_DEVOLUCION_NC — futuras NC-admin caen aca sin tocar este archivo de nuevo', () => {
    for (const origenNc of ORIGENES_DEVOLUCION_NC) {
      expect(ORIGENES_SALIDA_CAJA).toContain(origenNc)
    }
  })
})

describe('resolverConceptoSalida — resuelve el label de la columna Concepto', () => {
  it('para origen=NCR con nro_ncr resuelto via join, formatea "Devolución NC-{nro_ncr}"', () => {
    const label = resolverConceptoSalida(
      conceptoInput({ origen: 'NCR', nro_ncr: 'NCR-000001', concepto: 'Devolucion NCR NCR-000001 - Venta F-0001' })
    )
    expect(label).toBe('Devolución NC-NCR-000001')
  })

  it('para origen=NCR sin nro_ncr resuelto (join huerfano), cae al generico "Devolución NC"', () => {
    const label = resolverConceptoSalida(
      conceptoInput({ origen: 'NCR', nro_ncr: null, concepto: 'Devolucion NCR NCR-000002 - Venta F-0002' })
    )
    expect(label).toBe('Devolución NC')
  })

  it('para origenes no-NC (EGRESO_MANUAL) preserva el comportamiento previo: usa concepto tal cual', () => {
    const label = resolverConceptoSalida(conceptoInput({ origen: 'EGRESO_MANUAL', concepto: 'test' }))
    expect(label).toBe('test')
  })

  it('para EGRESO_MANUAL sin concepto, cae a destinatario', () => {
    const label = resolverConceptoSalida(
      conceptoInput({ origen: 'EGRESO_MANUAL', concepto: null, destinatario: 'Juan Perez' })
    )
    expect(label).toBe('Juan Perez')
  })

  it('para EGRESO_MANUAL sin concepto ni destinatario, cae a metodo_nombre', () => {
    const label = resolverConceptoSalida(
      conceptoInput({ origen: 'EGRESO_MANUAL', concepto: null, destinatario: null, metodo_nombre: 'EFECTIVO USD' })
    )
    expect(label).toBe('EFECTIVO USD')
  })
})
