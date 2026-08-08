import { compararCodigos } from '../producto-sort'

describe('compararCodigos', () => {
  it('ordena codigos puramente numericos en orden numerico natural', () => {
    expect(['10', '2', '102', '61'].sort(compararCodigos)).toEqual(['2', '10', '61', '102'])
  })

  it('ordena codigos alfanumericos con sufijo numerico en orden natural', () => {
    expect(['P-FAC-010', 'P-FAC-002', 'P-FAC-001'].sort(compararCodigos)).toEqual([
      'P-FAC-001',
      'P-FAC-002',
      'P-FAC-010',
    ])
  })
})
