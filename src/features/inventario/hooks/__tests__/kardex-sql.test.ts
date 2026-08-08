import { buildMovimientosFiltradosSql } from '../kardex-sql'

describe('buildMovimientosFiltradosSql', () => {
  it('interpola VE_OFFSET y produce bounds byte-identicos a los literales -04:00', () => {
    const sql = buildMovimientosFiltradosSql()
    expect(sql).toContain("T00:00:00-04:00")
    expect(sql).toContain("T23:59:59-04:00")
  })

  it('mantiene el filtro por empresa_id y el limite de 500 filas', () => {
    const sql = buildMovimientosFiltradosSql()
    expect(sql).toContain('WHERE mi.empresa_id = ?')
    expect(sql).toContain('LIMIT 500')
  })
})
