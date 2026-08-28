import Decimal from 'decimal.js'
import { resolverMontoConsolidacionLote } from '../resolucion-monto-consolidacion'

describe('resolverMontoConsolidacionLote', () => {
  it('retorna el monto reportado cuando es igual al total sistema (caso base)', () => {
    const resultado = resolverMontoConsolidacionLote({ totalFisicoNativo: new Decimal(1000) })

    expect(resultado.toString()).toBe('1000')
  })

  it('retorna 0 cuando el cajero reporto 0 (faltante total, no hace fallback a sistema)', () => {
    const resultado = resolverMontoConsolidacionLote({ totalFisicoNativo: new Decimal(0) })

    expect(resultado.toString()).toBe('0')
  })

  it('retorna el monto reportado exacto cuando es mayor al sistema (sobrante), sin perdida decimal', () => {
    const resultado = resolverMontoConsolidacionLote({ totalFisicoNativo: new Decimal('123.45') })

    expect(resultado.toString()).toBe('123.45')
  })

  it('retorna Decimal(0) cuando no hay conteo reportado (null), nunca sustituye por sistema', () => {
    const resultado = resolverMontoConsolidacionLote({ totalFisicoNativo: null })

    expect(resultado.toString()).toBe('0')
  })

  it('preserva precision decimal sin redondear (mas de 2 decimales)', () => {
    const resultado = resolverMontoConsolidacionLote({ totalFisicoNativo: new Decimal('10.999') })

    expect(resultado.toString()).toBe('10.999')
  })
})
