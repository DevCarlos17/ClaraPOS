import { tasaSchema } from '../tasa-schema'

describe('tasaSchema — casos validos', () => {
  it('acepta una tasa positiva normal', () => {
    const result = tasaSchema.safeParse({ valor: 36.5 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.valor).toBe(36.5)
    }
  })

  it('acepta tasa de 1 (minimo positivo)', () => {
    const result = tasaSchema.safeParse({ valor: 1 })
    expect(result.success).toBe(true)
  })

  it('acepta tasa con decimales de alta precision', () => {
    const result = tasaSchema.safeParse({ valor: 36.5012 })
    expect(result.success).toBe(true)
  })
})

describe('tasaSchema — casos invalidos', () => {
  it('rechaza tasa de 0', () => {
    const result = tasaSchema.safeParse({ valor: 0 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      expect(messages.some((m) => m.includes('mayor a 0'))).toBe(true)
    }
  })

  it('rechaza tasa negativa', () => {
    const result = tasaSchema.safeParse({ valor: -10 })
    expect(result.success).toBe(false)
  })

  it('rechaza valor ausente', () => {
    const result = tasaSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rechaza valor string no numerico', () => {
    const result = tasaSchema.safeParse({ valor: 'treinta y seis' })
    expect(result.success).toBe(false)
  })

  it('rechaza valor demasiado alto (> 999999)', () => {
    const result = tasaSchema.safeParse({ valor: 1000000 })
    expect(result.success).toBe(false)
  })
})
