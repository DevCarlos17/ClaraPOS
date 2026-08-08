import { formatDate, formatDateTime, formatHora, formatMesAnio } from '../format'

describe('formatDate', () => {
  it('default tz (VET) formatea un ISO con offset', () => {
    expect(formatDate('2026-06-07T20:30:00-04:00')).toBe('07/06/2026')
  })

  it('tz explicito distinto de VET puede desplazar el dia calendario', () => {
    // 2026-06-07T23:30:00-04:00 VET == 2026-06-08T03:30:00Z
    expect(formatDate('2026-06-07T23:30:00-04:00', 'UTC')).toBe('08/06/2026')
    // sin tz explicito, sigue usando VET por default
    expect(formatDate('2026-06-07T23:30:00-04:00')).toBe('07/06/2026')
  })

  it('fecha solo-dia YYYY-MM-DD ancla a mediodia VET sin importar tz (guard bug #3)', () => {
    expect(formatDate('2026-06-07')).toBe('07/06/2026')
    expect(formatDate('2026-06-07', 'America/New_York')).toBe('07/06/2026')
  })
})

describe('formatDateTime', () => {
  it('default tz (VET) formatea un ISO con offset', () => {
    expect(formatDateTime('2026-06-07T20:30:00-04:00')).toBe('07/06/2026 20:30')
  })

  it('tz explicito distinto de VET desplaza hora y puede desplazar el dia', () => {
    expect(formatDateTime('2026-06-07T20:30:00-04:00', 'UTC')).toBe('08/06/2026 00:30')
  })

  it('fecha solo-dia YYYY-MM-DD ancla a mediodia VET sin importar tz (guard bug #3)', () => {
    expect(formatDateTime('2026-06-07')).toBe('07/06/2026 12:00')
  })

  it('maneja forma kardex post-sync con espacio (UTC sin offset)', () => {
    expect(formatDateTime('2026-06-07 22:30:00')).toBe('07/06/2026 22:30')
  })

  it('maneja forma kardex pre-sync con offset explicito', () => {
    expect(formatDateTime('2026-06-07T20:30:00-04:00')).toBe('07/06/2026 20:30')
  })
})

describe('formatHora', () => {
  it('default tz (VET) extrae solo HH:mm', () => {
    expect(formatHora('2026-06-07T20:30:00-04:00')).toBe('20:30')
  })

  it('tz explicito distinto de VET desplaza la hora', () => {
    expect(formatHora('2026-06-07T20:30:00-04:00', 'UTC')).toBe('00:30')
  })
})

describe('formatMesAnio', () => {
  it('default tz (VET): fecha solo-dia ancla a mediodia VET y formatea mes/anio abreviado', () => {
    expect(formatMesAnio('2026-01-15')).toBe('ene. 26')
  })

  it('acepta tz explicito (fecha solo-dia sigue anclada a mediodia VET, guard bug #3)', () => {
    expect(formatMesAnio('2026-01-15', 'America/New_York')).toBe('ene. 26')
  })

  it('formatea distintos meses correctamente (triangulacion)', () => {
    expect(formatMesAnio('2026-12-01')).toBe('dic. 26')
  })
})
