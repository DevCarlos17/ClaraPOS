import { toMaskedDisplay, toFullDisplay } from '../decimal-display-mask'

describe('toMaskedDisplay', () => {
  it('redondea a 2 decimales por defecto', () => {
    expect(toMaskedDisplay(12.34567891)).toBe('12.35')
  })

  it('retorna vacio para string vacio (nunca "0.00")', () => {
    expect(toMaskedDisplay('')).toBe('')
  })

  it('retorna vacio para string con solo espacios', () => {
    expect(toMaskedDisplay('   ')).toBe('')
  })

  it('muestra "0.00" cuando el valor real es cero (distinto de vacio)', () => {
    expect(toMaskedDisplay(0)).toBe('0.00')
    expect(toMaskedDisplay('0')).toBe('0.00')
  })

  it('acepta un numero de decimales de vista custom', () => {
    expect(toMaskedDisplay(36.5, 4)).toBe('36.5000')
  })

  it('redondea correctamente casos donde el float nativo falla (1.005)', () => {
    // Number.prototype.toFixed nativo da "1.00" por error de representacion binaria;
    // decimal.js redondea via digitos exactos y da "1.01"
    expect(toMaskedDisplay(1.005, 2)).toBe('1.01')
  })
})

describe('toFullDisplay', () => {
  it('retorna vacio para string vacio (nunca "0.00000000")', () => {
    expect(toFullDisplay('')).toBe('')
  })

  it('recorta ceros de relleno cuando el valor tiene menos de 8 decimales', () => {
    expect(toFullDisplay(8.5)).toBe('8.5')
  })

  it('recorta a entero sin punto decimal cuando no hay parte decimal', () => {
    expect(toFullDisplay(8)).toBe('8')
  })

  it('NO recorta un digito final que es precision real (no relleno)', () => {
    expect(toFullDisplay(8.50000001)).toBe('8.50000001')
  })

  it('mantiene todos los decimales cuando son significativos (sin ceros de relleno)', () => {
    expect(toFullDisplay(0.12345678)).toBe('0.12345678')
  })

  it('acepta un numero de decimales de calculo custom', () => {
    expect(toFullDisplay(1.23456789, 4)).toBe('1.2346')
  })
})

describe('toMaskedDisplay + toFullDisplay integracion', () => {
  it('un mismo valor se enmascara a 2 decimales y revela a 8 sin perder precision', () => {
    const valorReal = 0.12345678
    expect(toMaskedDisplay(valorReal)).toBe('0.12')
    expect(toFullDisplay(valorReal)).toBe('0.12345678')
  })
})
