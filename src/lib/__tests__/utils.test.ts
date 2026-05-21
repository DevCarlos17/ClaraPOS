import { cn, getPageNumbers } from '../utils'

describe('cn', () => {
  it('combina clases sin conflictos', () => {
    expect(cn('text-red-500', 'bg-blue-500')).toBe('text-red-500 bg-blue-500')
  })

  it('resuelve conflictos de Tailwind (ultima clase gana)', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('ignora valores falsy', () => {
    expect(cn('text-red-500', false, undefined, null, '')).toBe('text-red-500')
  })

  it('aplica clases condicionales', () => {
    const isActive = true
    expect(cn('base', isActive && 'active')).toBe('base active')
  })
})

describe('getPageNumbers', () => {
  it('retorna todas las paginas cuando son <= 5', () => {
    expect(getPageNumbers(1, 3)).toEqual([1, 2, 3])
    expect(getPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('muestra puntos suspensivos al final cuando la pagina actual esta al inicio', () => {
    const result = getPageNumbers(1, 10)
    expect(result[0]).toBe(1)
    expect(result).toContain('...')
    expect(result[result.length - 1]).toBe(10)
  })

  it('muestra puntos suspensivos al inicio cuando la pagina actual esta al final', () => {
    const result = getPageNumbers(9, 10)
    expect(result[0]).toBe(1)
    expect(result).toContain('...')
    expect(result[result.length - 1]).toBe(10)
  })

  it('muestra puntos suspensivos en ambos lados cuando la pagina esta en el medio', () => {
    const result = getPageNumbers(5, 10)
    expect(result[0]).toBe(1)
    const dotsCount = result.filter((x) => x === '...').length
    expect(dotsCount).toBe(2)
    expect(result[result.length - 1]).toBe(10)
  })

  it('incluye la pagina actual y sus vecinas cuando esta en el medio', () => {
    const result = getPageNumbers(5, 10)
    expect(result).toContain(4)
    expect(result).toContain(5)
    expect(result).toContain(6)
  })
})
