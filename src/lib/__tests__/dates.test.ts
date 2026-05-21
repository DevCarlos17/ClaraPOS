import { vi } from 'vitest'
import { todayStr, daysAgo, startOfMonth, localNow } from '../dates'

describe('todayStr', () => {
  it('retorna la fecha de hoy en formato YYYY-MM-DD', () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00'))
    expect(todayStr()).toBe('2026-05-21')
    vi.useRealTimers()
  })

  it('formatea con ceros a la izquierda para mes y dia', () => {
    vi.setSystemTime(new Date('2026-01-05T00:00:00'))
    expect(todayStr()).toBe('2026-01-05')
    vi.useRealTimers()
  })
})

describe('daysAgo', () => {
  it('retorna la fecha de N dias atras', () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00'))
    expect(daysAgo(7)).toBe('2026-05-14')
    vi.useRealTimers()
  })

  it('retorna hoy cuando N es 0', () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00'))
    expect(daysAgo(0)).toBe('2026-05-21')
    vi.useRealTimers()
  })

  it('cruza mes correctamente', () => {
    vi.setSystemTime(new Date('2026-05-05T12:00:00'))
    expect(daysAgo(10)).toBe('2026-04-25')
    vi.useRealTimers()
  })
})

describe('startOfMonth', () => {
  it('retorna el primer dia del mes actual', () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00'))
    expect(startOfMonth()).toBe('2026-05-01')
    vi.useRealTimers()
  })

  it('funciona en enero (mes 01)', () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00'))
    expect(startOfMonth()).toBe('2026-01-01')
    vi.useRealTimers()
  })
})

describe('localNow', () => {
  it('retorna un string en formato ISO 8601', () => {
    vi.setSystemTime(new Date('2026-05-21T15:30:00.000Z'))
    const result = localNow()
    expect(result).toBe('2026-05-21T15:30:00.000Z')
    vi.useRealTimers()
  })
})
