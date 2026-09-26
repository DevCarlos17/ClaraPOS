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
  clasificarOrigenNc,
  splitSalidasNcPorOrigen,
  ORIGENES_SALIDA_CAJA,
  type SalidaCajaItem,
  type ConceptoSalidaInput,
  type ClasificacionNcInput,
  type SalidaNcSubtotalItem,
} from '../cuadre-salidas-caja-model'
import { ORIGENES_DEVOLUCION_NC, splitEgresosArqueo, type MovimientoManualItem } from '../cuadre-arqueo-teorico-model'

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

describe('clasificarOrigenNc — deriva el origen (POS vs ADM) SOLO desde nc.sesion_caja_id (discriminador real de punto de entrada)', () => {
  it('nc_sesion_caja_id presente clasifica como POS (la NC fue emitida desde una sesion de caja activa)', () => {
    expect(clasificarOrigenNc({ nc_sesion_caja_id: 'sesion-123' })).toBe('POS')
  })

  it('nc_sesion_caja_id null clasifica como ADM (entry point Admin/Tradicional, nunca vincula sesion)', () => {
    expect(clasificarOrigenNc({ nc_sesion_caja_id: null })).toBe('ADM')
  })

  it('nc_sesion_caja_id string vacio (defensivo, dato malformado) cae a ADM', () => {
    expect(clasificarOrigenNc({ nc_sesion_caja_id: '' })).toBe('ADM')
  })

  it('POS "devolver dinero" (modalidad REFUND_TESORERIA pero entryPoint POS) clasifica POS — el header persiste sesion_caja_id independientemente de la modalidad de liquidacion', () => {
    // Bug QA confirmado: `emitirNcRefund` (nota-credito-pos-modal.tsx) hardcodea
    // modalidad='REFUND_TESORERIA' CON entryPoint='POS'. La clasificacion vieja
    // (por liquidacion_modalidad) marcaba esto como Adm incorrectamente. La
    // correcta usa nc.sesion_caja_id, que SI se escribe para cualquier NC POS
    // sin importar la modalidad de liquidacion (use-notas-credito.ts:720/944).
    expect(clasificarOrigenNc({ nc_sesion_caja_id: 'sesion-cajero-activa' })).toBe('POS')
  })

  it('Admin REFUND_TESORERIA→SESION_CAJA (el egreso cae en la sesion elegida pero el header de la NC es Admin) clasifica ADM', () => {
    // El admin puede elegir destino SESION_CAJA para el egreso de tesoreria
    // (`movimientos_metodo_cobro.sesion_caja_id = linea.sesionCajaId`), pero el
    // HEADER de la NC (`notas_credito.sesion_caja_id`) queda NULL porque el
    // entry point es Admin/Tradicional (use-notas-credito.ts:720). Comportamiento
    // deseado: se clasifica ADM aunque el dinero aterrice en esta sesion.
    expect(clasificarOrigenNc({ nc_sesion_caja_id: null })).toBe('ADM')
  })

  it('undefined (fila malformada sin el campo) cae a ADM — mismo fallback seguro', () => {
    // `as` justificado: simula una fila real donde el campo directamente falta
    // (no pasa por el tipo `string | null` del contrato), para probar que el
    // fallback de runtime es robusto mas alla de lo que el type-checker exige.
    const itemSinCampo = {} as ClasificacionNcInput
    expect(clasificarOrigenNc(itemSinCampo)).toBe('ADM')
  })
})

describe('splitSalidasNcPorOrigen — subtotales por origen (POS/ADM) x moneda nativa (USD/Bs), sin convertir', () => {
  function ncItem(overrides: Partial<SalidaNcSubtotalItem> = {}): SalidaNcSubtotalItem {
    return {
      origen: 'NCR',
      nc_sesion_caja_id: 'sesion-activa',
      metodo_moneda: 'USD',
      monto: '0',
      ...overrides,
    }
  }

  it('mezcla POS/ADM en USD y Bs — separa los 4 buckets correctamente', () => {
    const items: SalidaNcSubtotalItem[] = [
      ncItem({ nc_sesion_caja_id: 'sesion-1', metodo_moneda: 'USD', monto: '100' }), // POS USD
      ncItem({ nc_sesion_caja_id: 'sesion-1', metodo_moneda: 'BS', monto: '250' }), // POS Bs
      ncItem({ nc_sesion_caja_id: null, metodo_moneda: 'USD', monto: '50' }), // ADM USD
      ncItem({ nc_sesion_caja_id: null, metodo_moneda: 'BS', monto: '75' }), // ADM Bs
    ]
    expect(splitSalidasNcPorOrigen(items)).toEqual({
      posUsd: 100,
      posBsNativo: 250,
      admUsd: 50,
      admBsNativo: 75,
    })
  })

  it('solo origen POS presente — los buckets ADM dan 0, no undefined', () => {
    const items: SalidaNcSubtotalItem[] = [
      ncItem({ nc_sesion_caja_id: 'sesion-1', metodo_moneda: 'USD', monto: '40' }),
      ncItem({ nc_sesion_caja_id: 'sesion-2', metodo_moneda: 'BS', monto: '60' }),
    ]
    const result = splitSalidasNcPorOrigen(items)
    expect(result).toEqual({ posUsd: 40, posBsNativo: 60, admUsd: 0, admBsNativo: 0 })
  })

  it('solo origen ADM presente — los buckets POS dan 0, no undefined', () => {
    const items: SalidaNcSubtotalItem[] = [
      ncItem({ nc_sesion_caja_id: null, metodo_moneda: 'USD', monto: '30' }),
    ]
    const result = splitSalidasNcPorOrigen(items)
    expect(result).toEqual({ posUsd: 0, posBsNativo: 0, admUsd: 30, admBsNativo: 0 })
  })

  it('items: [] — todos los buckets en 0', () => {
    expect(splitSalidasNcPorOrigen([])).toEqual({ posUsd: 0, posBsNativo: 0, admUsd: 0, admBsNativo: 0 })
  })

  it('filtra por ORIGENES_DEVOLUCION_NC — un item con origen no-NC no se cuenta aunque tenga nc_sesion_caja_id', () => {
    const items: SalidaNcSubtotalItem[] = [
      ncItem({ origen: 'EGRESO_MANUAL', nc_sesion_caja_id: 'sesion-1', metodo_moneda: 'USD', monto: '999' }),
      ncItem({ origen: 'NCR', nc_sesion_caja_id: 'sesion-1', metodo_moneda: 'USD', monto: '15' }),
    ]
    expect(splitSalidasNcPorOrigen(items)).toEqual({ posUsd: 15, posBsNativo: 0, admUsd: 0, admBsNativo: 0 })
  })
})

describe('invariante sagrado: split por origen reconstruye exactamente splitEgresosArqueo (display-only, ningun total cambia)', () => {
  it('posUsd + admUsd == devolucionesNcUsd, y posBsNativo + admBsNativo == devolucionesNcBsNativo', () => {
    // Mismos 4 montos/monedas modelados en las dos vistas: la vista "salida NC
    // individual" (con nc_sesion_caja_id, consumida por splitSalidasNcPorOrigen)
    // y la vista "movimiento manual" (con metodo_tipo/mov_tipo, consumida por
    // splitEgresosArqueo, Card "Arqueo Teorico"). Ambas fuentes son independientes
    // en produccion (use-cuadre.ts las expone por separado) pero deben sumar el
    // mismo total agregado — ese es el invariante que este test prueba.
    const salidaNcItems: SalidaNcSubtotalItem[] = [
      { origen: 'NCR', nc_sesion_caja_id: 'sesion-1', metodo_moneda: 'USD', monto: '100' }, // POS USD
      { origen: 'NCR', nc_sesion_caja_id: 'sesion-1', metodo_moneda: 'BS', monto: '250' }, // POS Bs
      { origen: 'NCR', nc_sesion_caja_id: null, metodo_moneda: 'USD', monto: '50' }, // ADM USD
      { origen: 'NCR', nc_sesion_caja_id: null, metodo_moneda: 'BS', monto: '75' }, // ADM Bs
    ]
    const movimientoManualItems: MovimientoManualItem[] = [
      { metodo_tipo: 'EFECTIVO', metodo_moneda: 'USD', mov_tipo: 'EGRESO', origen: 'NCR', total: 100 },
      { metodo_tipo: 'EFECTIVO', metodo_moneda: 'BS', mov_tipo: 'EGRESO', origen: 'NCR', total: 250 },
      { metodo_tipo: 'EFECTIVO', metodo_moneda: 'USD', mov_tipo: 'EGRESO', origen: 'NCR', total: 50 },
      { metodo_tipo: 'EFECTIVO', metodo_moneda: 'BS', mov_tipo: 'EGRESO', origen: 'NCR', total: 75 },
    ]

    const subtotales = splitSalidasNcPorOrigen(salidaNcItems)
    const arqueo = splitEgresosArqueo(movimientoManualItems)

    expect(subtotales.posUsd + subtotales.admUsd).toBe(arqueo.devolucionesNcUsd)
    expect(subtotales.posBsNativo + subtotales.admBsNativo).toBe(arqueo.devolucionesNcBsNativo)
  })
})
