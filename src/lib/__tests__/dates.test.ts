import { vi } from 'vitest'
import { todayStr, daysAgo, daysFromNow, startOfMonth, localNow } from '../dates'

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

  it('boundary 20:05 VET no salta al dia siguiente (UTC ya es 2026-05-22)', () => {
    // UTC 00:05 del 22 de mayo = 20:05 del 21 de mayo en Venezuela (UTC-4)
    vi.setSystemTime(new Date('2026-05-22T00:05:00.000Z'))
    expect(todayStr()).toBe('2026-05-21')
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

  it('boundary 21:00 VET no desplaza el rango un dia de mas (UTC ya es 2026-05-22)', () => {
    // UTC 01:00 del 22 de mayo = 21:00 del 21 de mayo en Venezuela (UTC-4)
    vi.setSystemTime(new Date('2026-05-22T01:00:00.000Z'))
    expect(daysAgo(7)).toBe('2026-05-14')
    vi.useRealTimers()
  })
})

describe('daysFromNow', () => {
  it('retorna la fecha de N dias adelante', () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00'))
    expect(daysFromNow(30)).toBe('2026-06-20')
    vi.useRealTimers()
  })

  it('retorna hoy cuando N es 0', () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00'))
    expect(daysFromNow(0)).toBe('2026-05-21')
    vi.useRealTimers()
  })

  it('cruza mes correctamente', () => {
    vi.setSystemTime(new Date('2026-05-25T12:00:00'))
    expect(daysFromNow(10)).toBe('2026-06-04')
    vi.useRealTimers()
  })

  it('boundary 20:15 VET no desplaza el vencimiento un dia de mas (UTC ya es 2026-05-22)', () => {
    // UTC 00:15 del 22 de mayo = 20:15 del 21 de mayo en Venezuela (UTC-4)
    vi.setSystemTime(new Date('2026-05-22T00:15:00.000Z'))
    expect(daysFromNow(30)).toBe('2026-06-20')
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
  it('retorna un string en formato ISO 8601 con offset venezolano -04:00', () => {
    // UTC 15:30 → Venezuela 11:30 (UTC-4)
    vi.setSystemTime(new Date('2026-05-21T15:30:00.000Z'))
    const result = localNow()
    expect(result).toBe('2026-05-21T11:30:00.000-04:00')
    vi.useRealTimers()
  })

  it('el texto empieza con la fecha venezolana (no UTC)', () => {
    // UTC 03:00 del 1 de junio = 23:00 del 31 de mayo en Venezuela
    vi.setSystemTime(new Date('2026-06-01T03:00:00.000Z'))
    const result = localNow()
    // Debe empezar con 2026-05-31, no con 2026-06-01
    expect(result.startsWith('2026-05-31')).toBe(true)
    expect(result.endsWith('-04:00')).toBe(true)
    vi.useRealTimers()
  })
})
