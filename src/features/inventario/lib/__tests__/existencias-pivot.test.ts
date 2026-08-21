import {
  pivotExistencias,
  ordenarDepositosColumnas,
  buildExistenciasPorDepositoSql,
  type ExistenciaRawRow,
} from '../existencias-pivot'

describe('pivotExistencias (EPD/Valor de Celda con Semantica de Fila Ausente)', () => {
  it('multiples depositos con stock: agrupa ambos en cantidadPorDeposito del mismo producto', () => {
    const rows: ExistenciaRawRow[] = [
      { producto_id: 'prod-1', codigo: 'P-001', nombre: 'Producto Uno', deposito_id: 'dep-A', cantidad_actual: '12.500' },
      { producto_id: 'prod-1', codigo: 'P-001', nombre: 'Producto Uno', deposito_id: 'dep-B', cantidad_actual: '3.000' },
    ]

    const result = pivotExistencias(rows)

    expect(result).toHaveLength(1)
    expect(result[0]!.cantidadPorDeposito).toEqual({
      'dep-A': '12.500',
      'dep-B': '3.000',
    })
  })

  it('producto sin fila de stock en un deposito especifico: esa clave esta ausente y el consumidor debe defaultear a 0.000', () => {
    const rows: ExistenciaRawRow[] = [
      { producto_id: 'prod-1', codigo: 'P-001', nombre: 'Producto Uno', deposito_id: 'dep-A', cantidad_actual: '12.500' },
    ]

    const result = pivotExistencias(rows)

    expect(result).toHaveLength(1)
    expect(result[0]!.cantidadPorDeposito['dep-A']).toBe('12.500')
    // dep-B nunca tuvo movimiento para este producto -> ausente en el mapa,
    // el consumidor (componente) debe leerlo como '0.000' via `?? '0.000'`.
    expect(result[0]!.cantidadPorDeposito['dep-B'] ?? '0.000').toBe('0.000')
  })

  it('producto sin NINGUNA fila de inventario_stock (LEFT JOIN sin match, deposito_id null): sigue apareciendo como fila con mapa vacio', () => {
    const rows: ExistenciaRawRow[] = [
      { producto_id: 'prod-2', codigo: 'P-002', nombre: 'Producto Nunca Movido', deposito_id: null, cantidad_actual: null },
    ]

    const result = pivotExistencias(rows)

    expect(result).toHaveLength(1)
    expect(result[0]!.producto_id).toBe('prod-2')
    expect(result[0]!.cantidadPorDeposito).toEqual({})
    expect(result[0]!.cantidadPorDeposito['dep-A'] ?? '0.000').toBe('0.000')
  })
})

describe('ordenarDepositosColumnas (EPD/Columnas de Depositos Activos Ordenadas)', () => {
  it('el deposito es_principal va primero, el resto ordenado por nombre ascendente', () => {
    const depositos = [
      { id: 'dep-C', nombre: 'Deposito Zeta', es_principal: 0 },
      { id: 'dep-A', nombre: 'Deposito Alfa', es_principal: 1 },
      { id: 'dep-B', nombre: 'Deposito Beta', es_principal: 0 },
    ]

    const result = ordenarDepositosColumnas(depositos)

    expect(result.map((d) => d.id)).toEqual(['dep-A', 'dep-B', 'dep-C'])
  })

  it('sin deposito principal marcado: ordena todos alfabeticamente por nombre', () => {
    const depositos = [
      { id: 'dep-Z', nombre: 'Zulu', es_principal: 0 },
      { id: 'dep-M', nombre: 'Mike', es_principal: 0 },
    ]

    const result = ordenarDepositosColumnas(depositos)

    expect(result.map((d) => d.id)).toEqual(['dep-M', 'dep-Z'])
  })
})

describe('buildExistenciasPorDepositoSql (kardex-sql.ts precedent — string-assertion, no PowerSync)', () => {
  it('filtra por empresa_id y tipo=P, hace LEFT JOIN de productos con inventario_stock', () => {
    const sql = buildExistenciasPorDepositoSql()

    expect(sql).toContain("WHERE p.empresa_id = ? AND p.tipo = 'P'")
    expect(sql).toContain('FROM productos p')
    expect(sql).toContain('LEFT JOIN inventario_stock s ON s.producto_id = p.id')
  })
})
