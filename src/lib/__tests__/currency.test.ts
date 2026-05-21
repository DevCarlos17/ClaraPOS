import { usdToBs, bsToUsd, formatUsd, formatBs, formatTasa } from '../currency'

describe('usdToBs', () => {
  it('convierte USD a Bs con tasa normal', () => {
    expect(usdToBs(100, 36.5)).toBe(3650)
  })

  it('retorna 0 cuando el monto es 0', () => {
    expect(usdToBs(0, 36.5)).toBe(0)
  })

  it('retorna 0 cuando la tasa es 0', () => {
    expect(usdToBs(100, 0)).toBe(0)
  })

  it('redondea a 2 decimales', () => {
    expect(usdToBs(1, 3.333)).toBe(3.33)
  })

  it('maneja valores negativos (refleja el resultado matematico)', () => {
    expect(usdToBs(-50, 36.5)).toBe(-1825)
  })
})

describe('bsToUsd', () => {
  it('convierte Bs a USD con tasa normal', () => {
    expect(bsToUsd(3650, 36.5)).toBe(100)
  })

  it('retorna 0 cuando la tasa es 0 (evita division por cero)', () => {
    expect(bsToUsd(1000, 0)).toBe(0)
  })

  it('retorna 0 cuando el monto es 0', () => {
    expect(bsToUsd(0, 36.5)).toBe(0)
  })

  it('redondea a 2 decimales', () => {
    expect(bsToUsd(100, 3)).toBe(33.33)
  })
})

describe('formatUsd', () => {
  it('formatea numero a string USD', () => {
    expect(formatUsd(1234.56)).toBe('$1,234.56')
  })

  it('formatea string numerico a USD', () => {
    expect(formatUsd('100')).toBe('$100.00')
  })

  it('devuelve $0.00 para NaN', () => {
    expect(formatUsd('no-es-numero')).toBe('$0.00')
  })

  it('muestra siempre 2 decimales', () => {
    expect(formatUsd(5)).toBe('$5.00')
  })
})

describe('formatBs', () => {
  it('formatea numero a string Bs', () => {
    const result = formatBs(1234.56)
    expect(result).toContain('Bs.')
    expect(result).toContain('1')
  })

  it('formatea string numerico a Bs', () => {
    const result = formatBs('100')
    expect(result).toContain('Bs.')
  })

  it('devuelve Bs. 0,00 para NaN', () => {
    expect(formatBs('no-es-numero')).toBe('Bs. 0,00')
  })
})

describe('formatTasa', () => {
  it('formatea tasa con 4 decimales y coma venezolana', () => {
    expect(formatTasa(36.5)).toBe('36,5000')
  })

  it('formatea string numerico', () => {
    expect(formatTasa('36.5')).toBe('36,5000')
  })

  it('devuelve 0,0000 para NaN', () => {
    expect(formatTasa('invalido')).toBe('0,0000')
  })

  it('preserva 4 decimales exactos', () => {
    expect(formatTasa(1)).toBe('1,0000')
  })
})
