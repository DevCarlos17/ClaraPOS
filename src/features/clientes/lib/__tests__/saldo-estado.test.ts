import { saldoEstado, SALDO_TEXT_CLASS } from '../saldo-estado'

describe('saldoEstado — funcion pura de tres estados (Correccion: cero debe ser neutral, no deuda)', () => {
  it('retorna "deuda" para saldo positivo (cliente debe dinero)', () => {
    expect(saldoEstado('30.00000000')).toBe('deuda')
  })

  it('retorna "favor" para saldo negativo (saldo a favor del cliente)', () => {
    expect(saldoEstado('-30.00000000')).toBe('favor')
  })

  it('retorna "neutral" para saldo exactamente cero, sin importar ceros de relleno', () => {
    expect(saldoEstado('0.00000000')).toBe('neutral')
    expect(saldoEstado('0')).toBe('neutral')
  })
})

describe('SALDO_TEXT_CLASS — mapa de clases compartido entre cliente-detalle y cliente-list', () => {
  it('mapea cada estado a su clase Tailwind correspondiente', () => {
    expect(SALDO_TEXT_CLASS.deuda).toBe('text-red-600')
    expect(SALDO_TEXT_CLASS.favor).toBe('text-green-600')
    expect(SALDO_TEXT_CLASS.neutral).toBe('text-muted-foreground')
  })
})
