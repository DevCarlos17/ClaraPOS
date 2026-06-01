import { formatDate, formatDateTime, formatNumber } from '@/lib/format'

describe('formatDate', () => {
  it('formats a valid ISO date with VE offset to dd/MM/yyyy', () => {
    // Usar offset explícito para evitar ambigüedad por timezone del entorno
    expect(formatDate('2024-01-15T12:00:00.000-04:00')).toBe('15/01/2024')
  })

  it('formats a UTC ISO date converting to Venezuela timezone', () => {
    // UTC 15:00 del 15 ene = 11:00 VE del 15 ene — misma fecha
    expect(formatDate('2024-01-15T15:00:00.000Z')).toBe('15/01/2024')
  })

  it('UTC midnight cruza al dia anterior en Venezuela', () => {
    // UTC 00:00 del 15 ene = 20:00 del 14 ene VE — fecha VE es el 14
    expect(formatDate('2024-01-15T00:00:00.000Z')).toBe('14/01/2024')
  })

  it('returns the original string for an invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('returns the original string for an empty string', () => {
    expect(formatDate('')).toBe('')
  })
})

describe('formatDateTime', () => {
  it('formats a VE-offset datetime to dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime('2024-01-15T10:30:00.000-04:00')).toBe('15/01/2024 10:30')
  })

  it('formats a UTC datetime converting to Venezuela timezone', () => {
    // UTC 14:30 = VE 10:30
    expect(formatDateTime('2024-01-15T14:30:00.000Z')).toBe('15/01/2024 10:30')
  })

  it('returns the original string for an invalid datetime', () => {
    expect(formatDateTime('not-a-datetime')).toBe('not-a-datetime')
  })
})

describe('formatNumber', () => {
  it('formats an integer with thousand separator', () => {
    expect(formatNumber(1000)).toContain('1.000')
  })

  it('formats a decimal to 2 places by default', () => {
    const result = formatNumber(12.5)
    expect(result).toContain('12')
    expect(result).toContain('50')
  })

  it('accepts a string number as input', () => {
    expect(formatNumber('42.5')).toContain('42')
  })

  it('returns "0" for NaN-producing input', () => {
    expect(formatNumber('abc')).toBe('0')
  })

  it('formats with 0 decimal places when decimals = 0', () => {
    const result = formatNumber(1500, 0)
    expect(result).not.toContain(',')
    expect(result).toContain('1.500')
  })

  it('formats with 4 decimal places when decimals = 4', () => {
    const result = formatNumber(1.5, 4)
    expect(result).toContain('5000')
  })
})
