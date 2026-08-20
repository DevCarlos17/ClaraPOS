import {
  resolveDepositoEgresoVenta,
  buildStockPorDepositoFragments,
} from '../deposito-venta'

describe('resolveDepositoEgresoVenta (Slice 2a — egreso de venta desde el deposito de la caja)', () => {
  it('caja con deposito asignado: usa el deposito de la caja, ignora el principal', () => {
    expect(resolveDepositoEgresoVenta('dep-caja-A', 'dep-principal')).toBe('dep-caja-A')
  })

  it('caja sin deposito (null): cae al deposito principal de la empresa', () => {
    expect(resolveDepositoEgresoVenta(null, 'dep-principal')).toBe('dep-principal')
  })

  it('caja y principal ambos null (sin sesion de caja ni deposito principal): retorna null', () => {
    expect(resolveDepositoEgresoVenta(null, null)).toBeNull()
  })
})

describe('buildStockPorDepositoFragments (Slice 2a — fragmentos SQL puros para lectura de stock por deposito)', () => {
  it('depositoId undefined (llamador no pide scoping): preserva el comportamiento legado — sin JOIN, lee p.stock directo, sin parametros extra', () => {
    const frag = buildStockPorDepositoFragments(undefined)
    expect(frag.joinInventarioStock).toBe('')
    expect(frag.stockExpr).toBe('p.stock')
    expect(frag.paramsPrefix).toEqual([])
  })

  it('depositoId string real: agrega JOIN a inventario_stock escopeado a ese deposito, stock via COALESCE, param antepuesto', () => {
    const frag = buildStockPorDepositoFragments('dep-B')
    expect(frag.joinInventarioStock).toContain('LEFT JOIN inventario_stock')
    expect(frag.joinInventarioStock).toContain('s.deposito_id = ?')
    expect(frag.stockExpr).toBe('COALESCE(s.cantidad_actual, 0)')
    expect(frag.paramsPrefix).toEqual(['dep-B'])
  })

  it('depositoId null (caso borde: sin caja ni deposito principal resuelto): JOIN presente pero param NULL, nunca matchea → todo queda en 0 (oculto)', () => {
    const frag = buildStockPorDepositoFragments(null)
    expect(frag.joinInventarioStock).toContain('LEFT JOIN inventario_stock')
    expect(frag.paramsPrefix).toEqual([null])
  })
})
