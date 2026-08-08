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
    // '2026-06-07 22:30:00' es UTC (post-sync PowerSync/Supabase). Convertido a
    // VET (UTC-4) da 18:30, NO 22:30 — el valor anterior era una coincidencia de
    // entorno (solo pasaba en runtimes con TZ ambiental = VET).
    expect(formatDateTime('2026-06-07 22:30:00')).toBe('07/06/2026 18:30')
  })

  it('forma-espacio UTC cerca de medianoche no desplaza el dia VET (regresion bug forma-espacio)', () => {
    // '2026-06-08 01:30:00' UTC == 2026-06-07 21:30:00 VET (UTC-4): mismo dia VET,
    // sin day-flip a 08/06.
    expect(formatDateTime('2026-06-08 01:30:00')).toBe('07/06/2026 21:30')
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

  it('maneja forma kardex post-sync con espacio (UTC sin offset)', () => {
    // '2026-06-07 22:30:00' UTC -> 18:30 VET, no 22:30.
    expect(formatHora('2026-06-07 22:30:00')).toBe('18:30')
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
