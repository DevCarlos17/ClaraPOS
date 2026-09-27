import { cn } from '../utils'

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
