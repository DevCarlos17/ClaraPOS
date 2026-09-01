import { formatFechaHoraMovimiento } from '../format-movimiento-fecha'

describe('formatFechaHoraMovimiento', () => {
  it('usa fecha (fecha de negocio) para el dia y created_at (VET) para la hora', () => {
    // Caso automatico: fecha coincide con el dia de created_at.
    expect(formatFechaHoraMovimiento('2026-08-08', '2026-08-08 15:43:00')).toBe('08/08/2026 11:43')
  })

  it('triangulacion: otro created_at UTC produce otra hora VET distinta', () => {
    expect(formatFechaHoraMovimiento('2026-08-08', '2026-08-08 22:10:00')).toBe('08/08/2026 18:10')
  })

  it('movimiento backdateado: el dia mostrado es el de fecha (negocio), no el de created_at (proceso)', () => {
    // Regresion PR #13: un movimiento MANUAL cargado hoy (created_at) con fecha
    // de negocio de hace una semana debe mostrar el dia que el usuario ingreso
    // en el formulario, no el dia en que se registro el movimiento en el sistema.
    expect(formatFechaHoraMovimiento('2026-08-01', '2026-08-08 16:00:00')).toBe('01/08/2026 12:00')
  })

  it('el dia ya no depende de la hora de created_at: sin riesgo de salto de dia cerca de medianoche UTC', () => {
    // Antes (bug de PR #13): el dia se derivaba de created_at, y un created_at
    // 2026-08-09 02:15:00 UTC (== 2026-08-08 22:15:00 VET) obligaba a resolver
    // el dia VET a partir de la hora. Ahora el dia viene directo de `fecha`
    // (columna solo-dia de negocio), que es independiente de la hora de created_at.
    expect(formatFechaHoraMovimiento('2026-08-08', '2026-08-09 02:15:00')).toBe('08/08/2026 22:15')
  })
})
