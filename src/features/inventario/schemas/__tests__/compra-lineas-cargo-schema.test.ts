import { lineaCargoSchema } from '../compra-schema'

const base = {
  concepto: 'EMPAQUE' as const,
  monto: 10,
  porcentaje_iva: 0 as const,
}

describe('lineaCargoSchema — caso valido', () => {
  it('acepta una linea de empaque bien formada', () => {
    expect(lineaCargoSchema.safeParse(base).success).toBe(true)
  })

  it('acepta una linea de flete con IVA 16%', () => {
    const result = lineaCargoSchema.safeParse({ ...base, concepto: 'FLETE', porcentaje_iva: 16 })
    expect(result.success).toBe(true)
  })
})

describe('lineaCargoSchema — monto', () => {
  it('rechaza monto <= 0', () => {
    const result = lineaCargoSchema.safeParse({ ...base, monto: 0 })
    expect(result.success).toBe(false)
  })

  it('rechaza monto negativo', () => {
    const result = lineaCargoSchema.safeParse({ ...base, monto: -5 })
    expect(result.success).toBe(false)
  })
})

describe('lineaCargoSchema — porcentaje_iva', () => {
  it('rechaza un porcentaje_iva distinto de 0 o 16 (ej: 8)', () => {
    const result = lineaCargoSchema.safeParse({ ...base, porcentaje_iva: 8 })
    expect(result.success).toBe(false)
  })

  it('rechaza un porcentaje_iva negativo', () => {
    const result = lineaCargoSchema.safeParse({ ...base, porcentaje_iva: -16 })
    expect(result.success).toBe(false)
  })
})

describe('lineaCargoSchema — concepto', () => {
  it('rechaza un concepto fuera del enum EMPAQUE|FLETE', () => {
    const result = lineaCargoSchema.safeParse({ ...base, concepto: 'OTRO' })
    expect(result.success).toBe(false)
  })
})
