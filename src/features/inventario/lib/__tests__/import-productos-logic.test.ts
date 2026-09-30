import {
  clasificarAccionFila,
  detectarColumnasPresentes,
  mergearProductoParaUpdate,
  validarFormatoPreciosTocados,
  validarPreciosMergeados,
} from '../import-productos-logic'

// Tests puros (sin DOM, sin PowerSync) del nucleo de clasificacion/merge/
// validacion de precios de PR3a (`import-productos-modos-deposito`). Ver
// openspec/changes/import-productos-modos-deposito/spec-pr3.md — R2, R3,
// R7, R8 y escenarios SC1-SC10.

describe('clasificarAccionFila (spec-pr3 R2 — tabla de verdad completa)', () => {
  it('SC1: modo=crear + codigoExiste=true => OMITIR', () => {
    expect(clasificarAccionFila(true, 'crear')).toBe('OMITIR')
  })

  it('modo=crear + codigoExiste=false => CREAR', () => {
    expect(clasificarAccionFila(false, 'crear')).toBe('CREAR')
  })

  it('SC2: modo=actualizar + codigoExiste=false => OMITIR', () => {
    expect(clasificarAccionFila(false, 'actualizar')).toBe('OMITIR')
  })

  it('modo=actualizar + codigoExiste=true => ACTUALIZAR', () => {
    expect(clasificarAccionFila(true, 'actualizar')).toBe('ACTUALIZAR')
  })

  it('SC3: modo=upsert + codigoExiste=true => ACTUALIZAR', () => {
    expect(clasificarAccionFila(true, 'upsert')).toBe('ACTUALIZAR')
  })

  it('SC3: modo=upsert + codigoExiste=false => CREAR', () => {
    expect(clasificarAccionFila(false, 'upsert')).toBe('CREAR')
  })
})

describe('detectarColumnasPresentes (spec-pr3 R3 — deteccion desde header, una vez para todo el archivo)', () => {
  it('construye un Set con las columnas no vacias del header, ignorando huecos', () => {
    const header = ['codigo', 'tipo', 'nombre', '', undefined, 'costo_usd']
    const columnas = detectarColumnasPresentes(header)

    expect(columnas.has('codigo')).toBe(true)
    expect(columnas.has('costo_usd')).toBe(true)
    expect(columnas.has('inexistente')).toBe(false)
    expect(columnas.size).toBe(4)
  })

  it('recorta espacios alrededor de cada nombre de columna', () => {
    const columnas = detectarColumnasPresentes([' costo_usd ', 'precio_venta_usd'])
    expect(columnas.has('costo_usd')).toBe(true)
  })
})

describe('mergearProductoParaUpdate (spec-pr3 R7)', () => {
  const existente = { costo_usd: '10.00000000', precio_venta_usd: '15.00000000', precio_mayor_usd: null as string | null }

  it('SC5: columna ausente del header => usa el valor existente en BD', () => {
    const columnas = detectarColumnasPresentes(['codigo', 'costo_usd'])
    const row = { costo_usd: '8', precio_venta_usd: '', precio_mayor_usd: '' }

    const merged = mergearProductoParaUpdate(row, columnas, existente)

    expect(merged).toEqual({ costo: 8, venta: 15, mayor: null })
  })

  it('SC6: columna presente pero celda vacia => mismo resultado que columna ausente (usa valor existente)', () => {
    const columnas = detectarColumnasPresentes(['codigo', 'costo_usd', 'precio_venta_usd'])
    const row = { costo_usd: '8', precio_venta_usd: '', precio_mayor_usd: '' }

    const merged = mergearProductoParaUpdate(row, columnas, existente)

    expect(merged.venta).toBe(15)
  })

  it('columna presente y celda con valor => usa el valor parseado de la fila', () => {
    const columnas = detectarColumnasPresentes(['precio_mayor_usd'])
    const row = { costo_usd: '', precio_venta_usd: '', precio_mayor_usd: '12' }

    const merged = mergearProductoParaUpdate(row, columnas, existente)

    expect(merged.mayor).toBe(12)
  })
})

describe('validarPreciosMergeados (spec-pr3 R8, LOCKED — merge-then-validate rechaza estado invalido)', () => {
  it('SC7: solo costo_usd tocado, ahora supera la venta existente => menciona costo 20, venta 15 y sugiere incluir precio_venta_usd', () => {
    const columnas = detectarColumnasPresentes(['costo_usd'])
    const errors = validarPreciosMergeados({ costo: 20, venta: 15, mayor: null }, columnas)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('20')
    expect(errors[0]).toContain('15')
    expect(errors[0]).toContain('precio_venta_usd')
  })

  it('SC9: solo precio_venta_usd tocado, ahora por debajo del costo existente => sugiere incluir costo_usd', () => {
    const columnas = detectarColumnasPresentes(['precio_venta_usd'])
    const errors = validarPreciosMergeados({ costo: 10, venta: 8, mayor: null }, columnas)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('costo_usd')
  })

  it('SC8: solo precio_mayor_usd tocado, ahora supera la venta existente => sugiere incluir precio_venta_usd o corregir precio_mayor_usd', () => {
    const columnas = detectarColumnasPresentes(['precio_mayor_usd'])
    const errors = validarPreciosMergeados({ costo: 10, venta: 15, mayor: 20 }, columnas)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('precio_venta_usd')
    expect(errors[0]).toContain('precio_mayor_usd')
  })

  it('simetrico: solo precio_venta_usd tocado (bajado), precio_mayor_usd existente queda por encima => sugiere incluir precio_mayor_usd', () => {
    const columnas = detectarColumnasPresentes(['precio_venta_usd'])
    const errors = validarPreciosMergeados({ costo: 5, venta: 10, mayor: 20 }, columnas)

    expect(errors.some((e) => e.includes('precio_mayor_usd'))).toBe(true)
  })

  it('SC10: costo/venta/mayor fusionados consistentes (todos tocados) => sin errores', () => {
    const columnas = detectarColumnasPresentes(['costo_usd', 'precio_venta_usd', 'precio_mayor_usd'])
    const errors = validarPreciosMergeados({ costo: 10, venta: 15, mayor: 12 }, columnas)

    expect(errors).toEqual([])
  })

  it('triangulacion: costo y venta tocados a la vez, resultado valido => sin errores', () => {
    const columnas = detectarColumnasPresentes(['costo_usd', 'precio_venta_usd'])
    const errors = validarPreciosMergeados({ costo: 8, venta: 15, mayor: null }, columnas)

    expect(errors).toEqual([])
  })

  it('triangulacion: costo y venta tocados a la vez, resultado invalido => mensaje generico nombra ambas columnas', () => {
    const columnas = detectarColumnasPresentes(['costo_usd', 'precio_venta_usd'])
    const errors = validarPreciosMergeados({ costo: 20, venta: 15, mayor: null }, columnas)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('costo_usd')
    expect(errors[0]).toContain('precio_venta_usd')
  })
})

describe('validarFormatoPreciosTocados (guard NaN extraido de validateRowActualizar — ACTUALIZAR, financiero)', () => {
  it('celda numerica valida en columna presente => sin errores', () => {
    const columnas = detectarColumnasPresentes(['costo_usd'])
    const row = { costo_usd: '10.50', precio_venta_usd: '', precio_mayor_usd: '' }

    expect(validarFormatoPreciosTocados(row, columnas)).toEqual([])
  })

  it('celda no numerica en columna presente+no-vacia => error "costo_usd invalido" (sin el guard, NaN haria que las comparaciones de validarPreciosMergeados sean siempre false)', () => {
    const columnas = detectarColumnasPresentes(['costo_usd'])
    const row = { costo_usd: 'abc', precio_venta_usd: '', precio_mayor_usd: '' }

    expect(validarFormatoPreciosTocados(row, columnas)).toEqual(['costo_usd invalido'])
  })

  it('triangulacion: precio_venta_usd no numerico en columna presente+no-vacia => error "precio_venta_usd invalido"', () => {
    const columnas = detectarColumnasPresentes(['precio_venta_usd'])
    const row = { costo_usd: '', precio_venta_usd: 'xyz', precio_mayor_usd: '' }

    expect(validarFormatoPreciosTocados(row, columnas)).toEqual(['precio_venta_usd invalido'])
  })

  it('triangulacion: precio_mayor_usd negativo en columna presente+no-vacia => error "precio_mayor_usd invalido"', () => {
    const columnas = detectarColumnasPresentes(['precio_mayor_usd'])
    const row = { costo_usd: '', precio_venta_usd: '', precio_mayor_usd: '-5' }

    expect(validarFormatoPreciosTocados(row, columnas)).toEqual(['precio_mayor_usd invalido'])
  })

  it('celda vacia en columna presente => no tocada, sin error (aunque la columna este en el header)', () => {
    const columnas = detectarColumnasPresentes(['costo_usd'])
    const row = { costo_usd: '', precio_venta_usd: '', precio_mayor_usd: '' }

    expect(validarFormatoPreciosTocados(row, columnas)).toEqual([])
  })

  it('columna ausente del header con valor no numerico en la fila => sin error (no se evalua, no esta tocada)', () => {
    const columnas = detectarColumnasPresentes(['nombre'])
    const row = { costo_usd: 'abc', precio_venta_usd: '', precio_mayor_usd: '' }

    expect(validarFormatoPreciosTocados(row, columnas)).toEqual([])
  })
})
