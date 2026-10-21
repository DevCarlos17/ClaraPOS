// Slice 1b-panel (preview-facturas-afectadas-reverso-tesoreria): el gate
// que decide si el preview de "facturas afectadas" aplica. Bug fijado aqui:
// el codigo viejo en `reverso-modal.tsx` comparaba
// `doc_origen_tipo === 'PAGO'`, una condicion que NUNCA es verdadera (el
// codigo real escribe 'PAGO_CXC'/'VENTA'). El gate correcto es solo
// `origen === 'TRANSFERENCIA_CLIENTE'` (spec Requirement "Aplicabilidad del
// preview basada en el origen real").
import { esTransferenciaCliente } from '../es-transferencia-cliente'

describe('esTransferenciaCliente — gate de aplicabilidad del preview de facturas afectadas', () => {
  it('origen === TRANSFERENCIA_CLIENTE -> true', () => {
    expect(esTransferenciaCliente('TRANSFERENCIA_CLIENTE')).toBe(true)
  })

  it('origen distinto (ej. lote/consolidacion de cierre) -> false', () => {
    expect(esTransferenciaCliente('CIERRE_CONSOLIDACION')).toBe(false)
  })

  it('origen null (sin movimiento cargado) -> false', () => {
    expect(esTransferenciaCliente(null)).toBe(false)
  })

  it('origen undefined -> false', () => {
    expect(esTransferenciaCliente(undefined)).toBe(false)
  })
})
