import { formatDate, formatDateTime, formatNumber } from '@/lib/format'

describe('formatDate', () => {
  it('formats a valid ISO date to dd/MM/yyyy', () => {
    expect(formatDate('2024-01-15')).toBe('15/01/2024')
  })

  it('returns the original string for an invalid date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('returns the original string for an empty string', () => {
    expect(formatDate('')).toBe('')
  })
})

describe('formatDateTime', () => {
  it('formats a valid ISO datetime to dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime('2024-01-15T10:30:00')).toBe('15/01/2024 10:30')
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
