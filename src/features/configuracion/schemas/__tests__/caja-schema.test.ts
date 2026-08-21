import { cajaSchema } from '../caja-schema'

const depositoIdValido = '550e8400-e29b-41d4-a716-446655440000'

const baseValida = {
  nombre: 'Caja Principal',
  deposito_id: depositoIdValido,
}

describe('cajaSchema — deposito_id requerido (Validacion 2)', () => {
  it('rechaza cuando deposito_id esta vacio', () => {
    const result = cajaSchema.safeParse({ ...baseValida, deposito_id: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('deposito_id')
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain('Selecciona un deposito')
    }
  })

  it('rechaza cuando deposito_id no se provee', () => {
    const { deposito_id: _omitido, ...sinDeposito } = baseValida
    const result = cajaSchema.safeParse(sinDeposito)
    expect(result.success).toBe(false)
  })

  it('acepta cuando deposito_id es un uuid valido', () => {
    const result = cajaSchema.safeParse(baseValida)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.deposito_id).toBe(depositoIdValido)
    }
  })
})

describe('cajaSchema — validaciones existentes de campos', () => {
  it('transforma nombre a mayusculas', () => {
    const result = cajaSchema.safeParse({ ...baseValida, nombre: 'caja principal' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.nombre).toBe('CAJA PRINCIPAL')
    }
  })

  it('rechaza nombre menor a 2 caracteres', () => {
    const result = cajaSchema.safeParse({ ...baseValida, nombre: 'A' })
    expect(result.success).toBe(false)
  })

  it('acepta ubicacion opcional (sin proveerla)', () => {
    const result = cajaSchema.safeParse(baseValida)
    expect(result.success).toBe(true)
  })

  it('acepta ubicacion cuando se provee', () => {
    const result = cajaSchema.safeParse({ ...baseValida, ubicacion: 'Planta baja' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ubicacion).toBe('Planta baja')
    }
  })

  it('is_active por defecto es true cuando no se provee', () => {
    const result = cajaSchema.safeParse(baseValida)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.is_active).toBe(true)
    }
  })

  it('acepta is_active explicito en false', () => {
    const result = cajaSchema.safeParse({ ...baseValida, is_active: false })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.is_active).toBe(false)
    }
  })
})
