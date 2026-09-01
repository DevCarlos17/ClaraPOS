import { esDepositoVentaValido } from '../caja-deposito-venta'

const DEPOSITOS_VENTA = [
  { id: 'dep-venta-1' },
  { id: 'dep-venta-2' },
]

describe('esDepositoVentaValido — Validacion 3 (defensa en profundidad)', () => {
  it('acepta un deposito que esta en la lista de depositos con permite_venta', () => {
    expect(esDepositoVentaValido('dep-venta-1', DEPOSITOS_VENTA)).toBe(true)
  })

  it('rechaza un deposito que no esta en la lista de depositos con permite_venta', () => {
    expect(esDepositoVentaValido('dep-desactivado', DEPOSITOS_VENTA)).toBe(false)
  })

  it('rechaza un deposito_id vacio', () => {
    expect(esDepositoVentaValido('', DEPOSITOS_VENTA)).toBe(false)
  })

  it('rechaza cuando la lista de depositos permitidos esta vacia', () => {
    expect(esDepositoVentaValido('dep-venta-1', [])).toBe(false)
  })
})
