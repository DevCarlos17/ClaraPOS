import { buildVentasPorDia } from '../ventas-chart-dias'

describe('buildVentasPorDia', () => {
  it('mantiene una venta del ultimo dia del rango en su clave correcta', () => {
    const result = buildVentasPorDia('2026-05-15', '2026-05-21', [
      { dia: '2026-05-21', totalUsd: 100 },
    ])
    const ultimoDia = result.find((d) => d.dia === '2026-05-21')
    expect(ultimoDia).toEqual({ dia: '2026-05-21', totalUsd: 100 })
  })

  it('el primer dia generado coincide con fechaInicio sin desplazarse', () => {
    const result = buildVentasPorDia('2026-05-15', '2026-05-21', [])
    expect(result[0].dia).toBe('2026-05-15')
  })

  it('rango de un solo dia (boundary 20:00 VET) no desplaza la clave al dia anterior', () => {
    const result = buildVentasPorDia('2026-05-21', '2026-05-21', [
      { dia: '2026-05-21', totalUsd: 250 },
    ])
    expect(result).toEqual([{ dia: '2026-05-21', totalUsd: 250 }])
  })

  it('rellena con totalUsd 0 los dias sin ventas dentro del rango', () => {
    const result = buildVentasPorDia('2026-05-19', '2026-05-21', [
      { dia: '2026-05-21', totalUsd: 100 },
    ])
    expect(result).toEqual([
      { dia: '2026-05-19', totalUsd: 0 },
      { dia: '2026-05-20', totalUsd: 0 },
      { dia: '2026-05-21', totalUsd: 100 },
    ])
  })
})
