import {
  canGoPrevious,
  canGoNext,
  formatPagerLabel,
  PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
  UNPAGINATED_PAGE_SIZE,
} from '../pagination-utils'

describe('PAGE_SIZE_OPTIONS', () => {
  it('expone exactamente [10, 25, 50, 100]', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([10, 25, 50, 100])
  })
})

describe('DEFAULT_PAGE_SIZE', () => {
  it('es 50 (PAGE_SIZE_OPTIONS[2]) — default de filas por pagina', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50)
  })
})

describe('UNPAGINATED_PAGE_SIZE', () => {
  it('es Number.MAX_SAFE_INTEGER para desactivar el slicing de filas', () => {
    expect(UNPAGINATED_PAGE_SIZE).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('canGoPrevious', () => {
  it('retorna false en la primera pagina (pageIndex=0)', () => {
    expect(canGoPrevious(0)).toBe(false)
  })

  it('retorna true en cualquier pagina despues de la primera', () => {
    expect(canGoPrevious(1)).toBe(true)
    expect(canGoPrevious(4)).toBe(true)
  })
})

describe('canGoNext', () => {
  it('retorna false en la ultima pagina', () => {
    expect(canGoNext(4, 5)).toBe(false)
  })

  it('retorna true cuando hay paginas siguientes', () => {
    expect(canGoNext(0, 5)).toBe(true)
    expect(canGoNext(3, 5)).toBe(true)
  })

  it('retorna false cuando pageCount es 0 (tabla vacia)', () => {
    expect(canGoNext(0, 0)).toBe(false)
  })
})

describe('limites combinados (pageCount<=1)', () => {
  it('ambos son false cuando pageCount es 0', () => {
    expect(canGoPrevious(0)).toBe(false)
    expect(canGoNext(0, 0)).toBe(false)
  })

  it('ambos son false cuando pageCount es 1 (unica pagina)', () => {
    expect(canGoPrevious(0)).toBe(false)
    expect(canGoNext(0, 1)).toBe(false)
  })
})

describe('formatPagerLabel', () => {
  it('formatea la primera pagina como "1 / M"', () => {
    expect(formatPagerLabel(0, 5)).toBe('1 / 5')
  })

  it('formatea una pagina intermedia', () => {
    expect(formatPagerLabel(2, 5)).toBe('3 / 5')
  })

  it('formatea la ultima pagina', () => {
    expect(formatPagerLabel(4, 5)).toBe('5 / 5')
  })

  it('retorna "0 / 0" cuando pageCount es 0 (tabla vacia)', () => {
    expect(formatPagerLabel(0, 0)).toBe('0 / 0')
  })

  it('formatea correctamente cuando pageCount es 1', () => {
    expect(formatPagerLabel(0, 1)).toBe('1 / 1')
  })
})
