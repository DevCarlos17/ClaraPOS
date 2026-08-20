import Decimal from 'decimal.js'
import { computeCorrelativoUsuario, buildTraspasoKardexPair } from '../traspasos'

describe('computeCorrelativoUsuario (TRI/Correlativo incrementa por usuario)', () => {
  it('usuario sin traspasos previos (count=0): el primer traspaso es correlativo 1', () => {
    expect(computeCorrelativoUsuario(0)).toBe(1)
  })

  it('usuario con 5 traspasos previos: el siguiente es correlativo 6', () => {
    expect(computeCorrelativoUsuario(5)).toBe(6)
  })
})

describe('buildTraspasoKardexPair (TRI/Traspaso individual mueve stock A→B atomicamente)', () => {
  const baseParams = {
    movSalidaId: 'mov-salida-1',
    movEntradaId: 'mov-entrada-1',
    empresa_id: 'empresa-1',
    producto_id: 'producto-1',
    depositoOrigenId: 'deposito-A',
    depositoDestinoId: 'deposito-B',
    cantidad: new Decimal('4.000'),
    usuario_id: 'usuario-1',
    fecha: '2026-08-20T10:00:00.000Z',
    traspasoId: 'traspaso-1',
  }

  it('salida sale del deposito origen con tipo S y origen TRA', () => {
    const { salida } = buildTraspasoKardexPair(baseParams)
    expect(salida.tipo).toBe('S')
    expect(salida.origen).toBe('TRA')
    expect(salida.deposito_id).toBe('deposito-A')
    expect(salida.cantidad).toBe('4.000')
  })

  it('entrada entra al deposito destino con tipo E y origen TRA', () => {
    const { entrada } = buildTraspasoKardexPair(baseParams)
    expect(entrada.tipo).toBe('E')
    expect(entrada.origen).toBe('TRA')
    expect(entrada.deposito_id).toBe('deposito-B')
    expect(entrada.cantidad).toBe('4.000')
  })

  it('salida y entrada comparten doc_origen_id (el id del traspaso), quedan enlazadas', () => {
    const { salida, entrada } = buildTraspasoKardexPair(baseParams)
    expect(salida.doc_origen_id).toBe('traspaso-1')
    expect(entrada.doc_origen_id).toBe('traspaso-1')
  })

  it('cantidad con distinto valor decimal: preserva 3 decimales sin drift', () => {
    const { salida, entrada } = buildTraspasoKardexPair({
      ...baseParams,
      cantidad: new Decimal('0.125'),
    })
    expect(salida.cantidad).toBe('0.125')
    expect(entrada.cantidad).toBe('0.125')
  })

  it('usa los ids de movimiento provistos por el llamador (pre-generados, no ejecuta SQL)', () => {
    const { salida, entrada } = buildTraspasoKardexPair(baseParams)
    expect(salida.id).toBe('mov-salida-1')
    expect(entrada.id).toBe('mov-entrada-1')
  })
})
