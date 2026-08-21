import { computeBackfillGateEstado } from '../inventario-stock-backfill-gate'

describe('computeBackfillGateEstado (función pura — decide si el POS debe gatear en "Verificando inventario…")', () => {
  it('flag YA estaba marcado al montar (arranques posteriores al primero): listo de inmediato, sin gate', () => {
    expect(
      computeBackfillGateEstado({ flagYaEstabaMarcado: true, operacionTerminada: false })
    ).toBe('listo')
  })

  it('flag AUSENTE y la operacion de backfill todavia no termino (primer arranque, en progreso): gatea', () => {
    expect(
      computeBackfillGateEstado({ flagYaEstabaMarcado: false, operacionTerminada: false })
    ).toBe('verificando')
  })

  it('flag AUSENTE pero la operacion ya termino (exito O fallo — ambos des-gatean): listo', () => {
    expect(
      computeBackfillGateEstado({ flagYaEstabaMarcado: false, operacionTerminada: true })
    ).toBe('listo')
  })

  it('caso trivial: flag marcado Y operacion terminada — sigue listo', () => {
    expect(
      computeBackfillGateEstado({ flagYaEstabaMarcado: true, operacionTerminada: true })
    ).toBe('listo')
  })
})
