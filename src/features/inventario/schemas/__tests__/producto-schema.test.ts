import { productoSchema, codigoEsRequerido } from '../producto-schema'

const baseValido = {
  codigo: 'PROD001',
  tipo: 'P' as const,
  nombre: 'Producto de prueba',
  departamento_id: '550e8400-e29b-41d4-a716-446655440000',
  costo_usd: 10,
  precio_venta_usd: 20,
  stock_minimo: 0,
  is_active: true,
}

describe('productoSchema — caso valido', () => {
  it('acepta un producto bien formado', () => {
    const result = productoSchema.safeParse(baseValido)
    expect(result.success).toBe(true)
  })

  it('transforma codigo y nombre a mayusculas', () => {
    const result = productoSchema.safeParse({
      ...baseValido,
      codigo: 'prod001',
      nombre: 'producto de prueba',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.codigo).toBe('PROD001')
      expect(result.data.nombre).toBe('PRODUCTO DE PRUEBA')
    }
  })
})

describe('productoSchema — regla precio_venta_usd >= costo_usd', () => {
  it('rechaza cuando precio_venta_usd < costo_usd', () => {
    const result = productoSchema.safeParse({
      ...baseValido,
      costo_usd: 100,
      precio_venta_usd: 50,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('precio_venta_usd')
      const messages = result.error.issues.map((i) => i.message)
      expect(messages.some((m) => m.includes('mayor o igual al costo'))).toBe(true)
    }
  })

  it('acepta cuando precio_venta_usd === costo_usd', () => {
    const result = productoSchema.safeParse({
      ...baseValido,
      costo_usd: 50,
      precio_venta_usd: 50,
    })
    expect(result.success).toBe(true)
  })

  it('omite la validacion para tipo Combo (C)', () => {
    const result = productoSchema.safeParse({
      ...baseValido,
      tipo: 'C' as const,
      costo_usd: 100,
      precio_venta_usd: 10,
    })
    expect(result.success).toBe(true)
  })
})

describe('productoSchema — regla precio_mayor_usd <= precio_venta_usd', () => {
  it('rechaza cuando precio_mayor_usd > precio_venta_usd', () => {
    const result = productoSchema.safeParse({
      ...baseValido,
      precio_venta_usd: 20,
      precio_mayor_usd: 25,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('precio_mayor_usd')
      const messages = result.error.issues.map((i) => i.message)
      expect(messages.some((m) => m.includes('menor o igual al precio de venta'))).toBe(true)
    }
  })

  it('acepta cuando precio_mayor_usd === precio_venta_usd', () => {
    const result = productoSchema.safeParse({
      ...baseValido,
      precio_venta_usd: 20,
      precio_mayor_usd: 20,
    })
    expect(result.success).toBe(true)
  })

  it('acepta cuando precio_mayor_usd es null', () => {
    const result = productoSchema.safeParse({
      ...baseValido,
      precio_mayor_usd: null,
    })
    expect(result.success).toBe(true)
  })

  it('acepta cuando precio_mayor_usd no se provee', () => {
    const result = productoSchema.safeParse(baseValido)
    expect(result.success).toBe(true)
  })
})

describe('productoSchema — validaciones de campos basicos', () => {
  // producto-numeracion-correlativa: el schema compartido ya NO exige codigo
  // no-vacio a nivel zod — esa validacion se movio a nivel de formulario
  // (codigoEsRequerido), condicional al modo de numeracion de la empresa
  // (solo se exige en 'libre'; en 'correlativo' el codigo llega vacio por
  // diseno, lo asigna el trigger server-side).
  it('acepta codigo vacio a nivel de schema (la validacion de requerido se movio al formulario)', () => {
    const result = productoSchema.safeParse({ ...baseValido, codigo: '' })
    expect(result.success).toBe(true)
  })

  it('rechaza nombre menor a 3 caracteres', () => {
    const result = productoSchema.safeParse({ ...baseValido, nombre: 'AB' })
    expect(result.success).toBe(false)
  })

  it('rechaza costo negativo', () => {
    const result = productoSchema.safeParse({ ...baseValido, costo_usd: -1 })
    expect(result.success).toBe(false)
  })

  it('rechaza stock_minimo negativo', () => {
    const result = productoSchema.safeParse({ ...baseValido, stock_minimo: -1 })
    expect(result.success).toBe(false)
  })
})

describe('codigoEsRequerido — validacion de "codigo requerido" condicional al modo de numeracion (producto-numeracion-correlativa)', () => {
  it('modo libre: el codigo es requerido (el usuario lo define)', () => {
    expect(codigoEsRequerido('libre')).toBe(true)
  })

  it('modo correlativo: el codigo NO es requerido (lo asigna el servidor, llega vacio)', () => {
    expect(codigoEsRequerido('correlativo')).toBe(false)
  })
})
