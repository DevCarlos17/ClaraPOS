import { debeExcluirseDeConsolidacionCierre } from '../consolidacion-cierre'

describe('debeExcluirseDeConsolidacionCierre', () => {
  it('excluye un metodo con deposito_directo=1 (ya posteado al banco en la venta)', () => {
    const resultado = debeExcluirseDeConsolidacionCierre({ deposito_directo: 1 })

    expect(resultado).toBe(true)
  })

  it('no excluye un metodo con deposito_directo=0 (consolida por lote normalmente)', () => {
    const resultado = debeExcluirseDeConsolidacionCierre({ deposito_directo: 0 })

    expect(resultado).toBe(false)
  })
})
