import {
  clasificarAccionFila,
  debeIgnorarStockInicial,
  detectarColumnasPresentes,
  estimarPesoSync,
  extraerCamposAnteriores,
  extraerValoresNuevos,
  mapConTimestampPropio,
  mergearProductoParaUpdate,
  parseTipoImpuesto,
  resolverDepositoFila,
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

    expect(merged).toEqual({ costo: 8, venta: 15, mayor: null, especial: null })
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

  it('B1.1: precio_mayor_usd > precio_venta_usd ya NO es un error (se quita la restriccion, nunca sabemos que tiene en mente el usuario)', () => {
    const columnas = detectarColumnasPresentes(['precio_mayor_usd'])
    const errors = validarPreciosMergeados({ costo: 5, venta: 15, mayor: 20 }, columnas)

    expect(errors).toEqual([])
  })

  it('B1.1: precio_mayor_usd < precio_venta_usd sigue siendo valido (nunca estuvo restringido en ese sentido)', () => {
    const columnas = detectarColumnasPresentes(['precio_mayor_usd'])
    const errors = validarPreciosMergeados({ costo: 5, venta: 10, mayor: 3 }, columnas)

    expect(errors).toEqual([])
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

describe('resolverDepositoFila (spec-pr3 R9-R11, PR3b)', () => {
  const depositosActivos = [
    { id: 'dep-1', nombre: 'SUCURSAL NORTE' },
    { id: 'dep-2', nombre: 'SUCURSAL SUR' },
  ]

  it('SC11: celda con nombre exacto de un deposito activo => deposito_id apunta a ese deposito, sin error', () => {
    const columnas = detectarColumnasPresentes(['deposito'])

    const result = resolverDepositoFila('SUCURSAL NORTE', 'CREAR', columnas, depositosActivos, null)

    expect(result).toEqual({ deposito_id: 'dep-1' })
  })

  it('SC12: celda sin coincidencia contra depositos activos => error de fila nombrando la celda', () => {
    const columnas = detectarColumnasPresentes(['deposito'])

    const result = resolverDepositoFila('BODEGA FANTASMA', 'CREAR', columnas, depositosActivos, null)

    expect(result.deposito_id).toBeUndefined()
    expect(result.error).toBe('deposito "BODEGA FANTASMA" no existe o no esta activo')
  })

  it('SC13: fila CREAR con celda vacia y columna deposito ausente del header => fallback al deposito principal resuelto', () => {
    const columnas = detectarColumnasPresentes(['codigo', 'nombre'])

    const result = resolverDepositoFila('', 'CREAR', columnas, depositosActivos, 'dep-principal')

    expect(result).toEqual({ deposito_id: 'dep-principal' })
  })

  it('triangulacion: fila CREAR con columna deposito presente pero celda vacia => tambien cae al principal (ausente y vacio son equivalentes)', () => {
    const columnas = detectarColumnasPresentes(['deposito'])

    const result = resolverDepositoFila('', 'CREAR', columnas, depositosActivos, 'dep-principal')

    expect(result).toEqual({ deposito_id: 'dep-principal' })
  })

  it('SC14: fila ACTUALIZAR con celda vacia => no se resuelve ningun deposito_id (no tocar producto.deposito_id existente)', () => {
    const columnas = detectarColumnasPresentes(['codigo', 'deposito'])

    const result = resolverDepositoFila('', 'ACTUALIZAR', columnas, depositosActivos, 'dep-principal')

    expect(result).toEqual({})
  })

  it('triangulacion: fila CREAR sin deposito principal resuelto (empresa sin depositos activos) y celda vacia => sin deposito_id ni error', () => {
    const columnas = detectarColumnasPresentes(['codigo'])

    const result = resolverDepositoFila('', 'CREAR', columnas, [], null)

    expect(result).toEqual({})
  })

  it('triangulacion: fila ACTUALIZAR con celda valida => SI se resuelve deposito_id (cambia el default, R11)', () => {
    const columnas = detectarColumnasPresentes(['deposito'])

    const result = resolverDepositoFila('SUCURSAL SUR', 'ACTUALIZAR', columnas, depositosActivos, 'dep-1')

    expect(result).toEqual({ deposito_id: 'dep-2' })
  })
})

describe('debeIgnorarStockInicial (spec-pr3 R12, PR3b)', () => {
  it('SC16: fila ACTUALIZAR con stock_inicial > 0 => true (se ignora, advertencia no bloqueante)', () => {
    expect(debeIgnorarStockInicial('ACTUALIZAR', '50')).toBe(true)
  })

  it('fila ACTUALIZAR con stock_inicial vacio => false (nada que ignorar)', () => {
    expect(debeIgnorarStockInicial('ACTUALIZAR', '')).toBe(false)
  })

  it('triangulacion: fila ACTUALIZAR con stock_inicial="0" => false (cero no cuenta como intento de mover stock)', () => {
    expect(debeIgnorarStockInicial('ACTUALIZAR', '0')).toBe(false)
  })

  it('triangulacion: fila CREAR con stock_inicial > 0 => false (la regla solo aplica a ACTUALIZAR, en CREAR se usa normalmente)', () => {
    expect(debeIgnorarStockInicial('CREAR', '50')).toBe(false)
  })
})

describe('parseTipoImpuesto (Fase A commit 3 — IVA por porcentaje)', () => {
  it('"Exento" => tipo Exento, porcentaje null', () => {
    expect(parseTipoImpuesto('Exento')).toEqual({ tipo: 'Exento', porcentaje: null })
  })

  it('"exento" (minusculas) => tipo Exento', () => {
    expect(parseTipoImpuesto('exento')).toEqual({ tipo: 'Exento', porcentaje: null })
  })

  it('"Exonerado" => tipo Exonerado, porcentaje null', () => {
    expect(parseTipoImpuesto('Exonerado')).toEqual({ tipo: 'Exonerado', porcentaje: null })
  })

  it('"exonerado" (minusculas) => tipo Exonerado', () => {
    expect(parseTipoImpuesto('exonerado')).toEqual({ tipo: 'Exonerado', porcentaje: null })
  })

  it('"Gravable" sin numero => tipo Gravable, porcentaje null', () => {
    expect(parseTipoImpuesto('Gravable')).toEqual({ tipo: 'Gravable', porcentaje: null })
  })

  it('"Gravable 16" => tipo Gravable, porcentaje 16', () => {
    expect(parseTipoImpuesto('Gravable 16')).toEqual({ tipo: 'Gravable', porcentaje: 16 })
  })

  it('"Gravable 8" => tipo Gravable, porcentaje 8', () => {
    expect(parseTipoImpuesto('Gravable 8')).toEqual({ tipo: 'Gravable', porcentaje: 8 })
  })

  it('"GRAVABLE 16.00" (mayusculas + decimales) => tipo Gravable, porcentaje 16', () => {
    expect(parseTipoImpuesto('GRAVABLE 16.00')).toEqual({ tipo: 'Gravable', porcentaje: 16 })
  })

  it('"invalid" => Exento con invalid:true (celda no reconocida)', () => {
    expect(parseTipoImpuesto('invalid')).toEqual({ tipo: 'Exento', porcentaje: null, invalid: true })
  })

  it('cadena vacia => Exento con invalid:true', () => {
    expect(parseTipoImpuesto('')).toEqual({ tipo: 'Exento', porcentaje: null, invalid: true })
  })
})

describe('validarPreciosMergeados — precio_especial_usd (Fase A commit 3)', () => {
  it('especial=3, costo=5 => error (especial < costo), sugiere incluir costo_usd', () => {
    const columnas = detectarColumnasPresentes(['precio_especial_usd'])
    const errors = validarPreciosMergeados({ costo: 5, venta: 10, mayor: null, especial: 3 }, columnas)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('costo_usd')
    expect(errors[0]).toContain('3')
    expect(errors[0]).toContain('5')
  })

  it('especial=20, venta=15, costo=5 => sin error (especial > venta esta permitido, B1.1)', () => {
    const columnas = detectarColumnasPresentes(['precio_especial_usd'])
    const errors = validarPreciosMergeados({ costo: 5, venta: 15, mayor: null, especial: 20 }, columnas)

    expect(errors).toEqual([])
  })

  it('especial null (no tocado) => sin error de especial', () => {
    const columnas = detectarColumnasPresentes(['costo_usd'])
    const errors = validarPreciosMergeados({ costo: 5, venta: 10, mayor: null, especial: null }, columnas)

    expect(errors).toEqual([])
  })

  it('especial ausente del objeto (compatibilidad retro) => sin error de especial', () => {
    const columnas = detectarColumnasPresentes(['costo_usd'])
    const errors = validarPreciosMergeados({ costo: 5, venta: 10, mayor: null }, columnas)

    expect(errors).toEqual([])
  })
})

describe('mergearProductoParaUpdate — precio_especial_usd (Fase A commit 3)', () => {
  const existente = {
    costo_usd: '10.00000000',
    precio_venta_usd: '15.00000000',
    precio_mayor_usd: null as string | null,
    precio_especial_usd: '9.00000000' as string | null,
  }

  it('columna presente y celda con valor => usa el valor de la fila', () => {
    const columnas = detectarColumnasPresentes(['precio_especial_usd'])
    const row = { costo_usd: '', precio_venta_usd: '', precio_mayor_usd: '', precio_especial_usd: '11' }

    const merged = mergearProductoParaUpdate(row, columnas, existente)

    expect(merged.especial).toBe(11)
  })

  it('columna ausente => usa el valor existente en BD', () => {
    const columnas = detectarColumnasPresentes(['codigo'])
    const row = { costo_usd: '', precio_venta_usd: '', precio_mayor_usd: '', precio_especial_usd: '' }

    const merged = mergearProductoParaUpdate(row, columnas, existente)

    expect(merged.especial).toBe(9)
  })

  it('sin precio_especial_usd existente (null en BD) y columna ausente => especial null', () => {
    const columnas = detectarColumnasPresentes(['codigo'])
    const row = { costo_usd: '', precio_venta_usd: '', precio_mayor_usd: '', precio_especial_usd: '' }

    const merged = mergearProductoParaUpdate(row, columnas, { ...existente, precio_especial_usd: null })

    expect(merged.especial).toBeNull()
  })
})

describe('validarFormatoPreciosTocados — precio_especial_usd (Fase A commit 3)', () => {
  it('precio_especial_usd no numerico en columna presente+no-vacia => error', () => {
    const columnas = detectarColumnasPresentes(['precio_especial_usd'])
    const row = { costo_usd: '', precio_venta_usd: '', precio_mayor_usd: '', precio_especial_usd: 'abc' }

    expect(validarFormatoPreciosTocados(row, columnas)).toEqual(['precio_especial_usd invalido'])
  })

  it('precio_especial_usd negativo => error', () => {
    const columnas = detectarColumnasPresentes(['precio_especial_usd'])
    const row = { costo_usd: '', precio_venta_usd: '', precio_mayor_usd: '', precio_especial_usd: '-5' }

    expect(validarFormatoPreciosTocados(row, columnas)).toEqual(['precio_especial_usd invalido'])
  })

  it('precio_especial_usd valido => sin errores', () => {
    const columnas = detectarColumnasPresentes(['precio_especial_usd'])
    const row = { costo_usd: '', precio_venta_usd: '', precio_mayor_usd: '', precio_especial_usd: '12.5' }

    expect(validarFormatoPreciosTocados(row, columnas)).toEqual([])
  })
})

describe('estimarPesoSync (Fase A commit 3 — estimado de peso de la subida a PowerSync)', () => {
  it('fila OMITIR no suma al total', () => {
    const columnas = detectarColumnasPresentes(['codigo'])
    const total = estimarPesoSync([{ accion: 'OMITIR', valores: { codigo: 'X' } }], columnas)

    expect(total).toBe(0)
  })

  it('una fila CREAR suma 150 base + el largo del JSON de sus valores tocados', () => {
    const columnas = detectarColumnasPresentes(['codigo', 'nombre'])
    const valores = { codigo: 'PROD-1', nombre: 'PRODUCTO UNO' }
    const total = estimarPesoSync([{ accion: 'CREAR', valores }], columnas)

    expect(total).toBe(150 + JSON.stringify(valores).length)
  })

  it('solo cuenta las columnas presentes en el header, no todo el objeto valores', () => {
    const columnas = detectarColumnasPresentes(['codigo'])
    const valores = { codigo: 'PROD-1', nombre: 'IGNORADO' }
    const total = estimarPesoSync([{ accion: 'CREAR', valores }], columnas)

    expect(total).toBe(150 + JSON.stringify({ codigo: 'PROD-1' }).length)
  })

  it('suma el peso de multiples filas no-OMITIR', () => {
    const columnas = detectarColumnasPresentes(['codigo'])
    const filas = [
      { accion: 'CREAR' as const, valores: { codigo: 'A' } },
      { accion: 'ACTUALIZAR' as const, valores: { codigo: 'BB' } },
      { accion: 'OMITIR' as const, valores: { codigo: 'C' } },
    ]
    const total = estimarPesoSync(filas, columnas)

    const esperado =
      150 + JSON.stringify({ codigo: 'A' }).length +
      150 + JSON.stringify({ codigo: 'BB' }).length

    expect(total).toBe(esperado)
  })
})

describe('extraerCamposAnteriores (auditoria import, Fase B)', () => {
  const productoExistente = {
    nombre: 'PRODUCTO VIEJO',
    costo_usd: '10.00000000',
    precio_venta_usd: '15.00000000',
    departamento_id: 'dep-1',
  }

  it('solo incluye los campos cuya columna vino en el archivo', () => {
    const columnas = detectarColumnasPresentes(['codigo', 'nombre', 'costo_usd'])

    const resultado = extraerCamposAnteriores(productoExistente, columnas)

    expect(resultado).toEqual({ nombre: 'PRODUCTO VIEJO', costo_usd: '10.00000000' })
    expect(resultado).not.toHaveProperty('precio_venta_usd')
  })

  it('columnasPresentes vacia (solo codigo) => retorna null', () => {
    const columnas = detectarColumnasPresentes(['codigo'])

    const resultado = extraerCamposAnteriores(productoExistente, columnas)

    expect(resultado).toBeNull()
  })
})

describe('extraerValoresNuevos (auditoria import, Fase B)', () => {
  function buildRow(overrides: Partial<Parameters<typeof extraerValoresNuevos>[0]>) {
    return {
      accion: 'CREAR' as const,
      codigo: 'PROD-1',
      nombre: '',
      tipo: 'P',
      departamento: '',
      costo_usd: '',
      precio_venta_usd: '',
      precio_mayor_usd: '',
      precio_especial_usd: '',
      stock_minimo: '',
      stock_inicial: '',
      unidad: '',
      tipo_impuesto: '',
      codigo_barras: '',
      presentacion: '',
      ubicacion: '',
      maneja_lotes: '',
      deposito: '',
      ...overrides,
    }
  }

  it('fila CREAR con nombre + costo_usd => ambos campos presentes', () => {
    const row = buildRow({ accion: 'CREAR', nombre: 'PRODUCTO NUEVO', costo_usd: '8.00' })
    const columnas = detectarColumnasPresentes(['codigo', 'nombre', 'costo_usd'])

    const resultado = extraerValoresNuevos(row, columnas)

    expect(resultado).toEqual({ nombre: 'PRODUCTO NUEVO', costo_usd: '8.00' })
  })

  it('fila OMITIR => retorna null', () => {
    const row = buildRow({ accion: 'OMITIR', nombre: 'IGNORADO' })
    const columnas = detectarColumnasPresentes(['codigo', 'nombre'])

    expect(extraerValoresNuevos(row, columnas)).toBeNull()
  })

  it('fila ACTUALIZAR con solo nombre tocado (columna presente) => solo nombre en el resultado', () => {
    const row = buildRow({ accion: 'ACTUALIZAR', nombre: 'PRODUCTO ACTUALIZADO', costo_usd: '' })
    const columnas = detectarColumnasPresentes(['codigo', 'nombre'])

    const resultado = extraerValoresNuevos(row, columnas)

    expect(resultado).toEqual({ nombre: 'PRODUCTO ACTUALIZADO' })
    expect(resultado).not.toHaveProperty('costo_usd')
  })
})

// producto-numeracion-correlativa (SC-B1, D4): bug de causa raiz era
// `const now = localNow()` calculado UNA vez fuera del loop de import masivo
// -> N filas comparten el MISMO created_at, "Ultimo codigo creado" (ORDER BY
// created_at DESC) queda indeterminado con N>1 filas. El fix mueve la
// obtencion del timestamp DENTRO de cada iteracion. `mapConTimestampPropio`
// extrae ese mecanismo a una funcion pura e inyectable (via `obtenerAhora`)
// para poder probarlo sin depender del reloj real del sistema.
describe('mapConTimestampPropio (SC-B1 — timestamp unico por fila en import masivo)', () => {
  it('llama obtenerAhora() una vez POR CADA item, no una sola vez para todos (reproduce el fix de la causa raiz)', () => {
    let contador = 0
    const obtenerAhora = vi.fn(() => `2026-01-01T00:00:00.${String(contador++).padStart(3, '0')}-04:00`)

    const resultado = mapConTimestampPropio(['fila-A', 'fila-B', 'fila-C'], (item, ts) => ({ item, ts }), obtenerAhora)

    expect(obtenerAhora).toHaveBeenCalledTimes(3)
    const timestamps = resultado.map((r) => r.ts)
    expect(new Set(timestamps).size).toBe(3)
  })

  it('con reloj estatico (bug reproducido): mismo valor para N>1 filas evidencia la necesidad del fix', () => {
    const relojCongelado = () => '2026-01-01T00:00:00.000-04:00'

    const resultado = mapConTimestampPropio(['fila-A', 'fila-B'], (item, ts) => ({ item, ts }), relojCongelado)

    // Documenta el comportamiento: con un reloj que no avanza, incluso
    // llamando obtenerAhora() por fila, los valores pueden coincidir — la
    // deduplicacion final para "Ultimo codigo creado" depende del tiebreaker
    // `id DESC` agregado en la query (D4), no solo del timestamp.
    expect(resultado.map((r) => r.ts)).toEqual([relojCongelado(), relojCongelado()])
  })
})
