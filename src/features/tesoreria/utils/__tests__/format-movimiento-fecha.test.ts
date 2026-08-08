import { formatFechaHoraMovimiento } from '../format-movimiento-fecha'

describe('formatFechaHoraMovimiento', () => {
  it('convierte created_at (UTC forma-espacio) a VET, no muestra la hora UTC cruda', () => {
    // Caso reportado por el tester: created_at UTC 15:43 debia mostrarse
    // como 11:43 VET (UTC-4), no como 15:43 (el bug del slice crudo).
    expect(formatFechaHoraMovimiento('2026-08-08 15:43:00')).toBe('08/08/2026 11:43')
  })

  it('triangulacion: otro created_at UTC produce otra hora VET distinta', () => {
    expect(formatFechaHoraMovimiento('2026-08-08 22:10:00')).toBe('08/08/2026 18:10')
  })

  it('forma-espacio UTC cerca de medianoche desplaza el dia VET correctamente', () => {
    // 2026-08-09 02:15:00 UTC == 2026-08-08 22:15:00 VET (UTC-4)
    expect(formatFechaHoraMovimiento('2026-08-09 02:15:00')).toBe('08/08/2026 22:15')
  })
})
