import { clienteSchema } from '../cliente-schema'

const baseValido = {
  identificacion: 'V22448021',
  nombre: 'Juan Perez',
  limite_credito_usd: 0,
  is_active: true,
}

describe('clienteSchema — caso valido', () => {
  it('acepta un cliente bien formado', () => {
    const result = clienteSchema.safeParse(baseValido)
    expect(result.success).toBe(true)
  })

  it('transforma nombre a mayusculas', () => {
    const result = clienteSchema.safeParse({ ...baseValido, nombre: 'juan perez' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.nombre).toBe('JUAN PEREZ')
    }
  })

  it('acepta cedula con prefijo E', () => {
    const result = clienteSchema.safeParse({ ...baseValido, identificacion: 'E12345678' })
    expect(result.success).toBe(true)
  })

  it('sanitiza cedula con guiones y puntos', () => {
    const result = clienteSchema.safeParse({ ...baseValido, identificacion: 'V-22.448.021' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.identificacion).toBe('V22448021')
    }
  })
})

describe('clienteSchema — validacion de identificacion', () => {
  it('rechaza identificacion con formato invalido', () => {
    const result = clienteSchema.safeParse({ ...baseValido, identificacion: 'X12345' })
    expect(result.success).toBe(false)
  })

  it('rechaza identificacion muy corta', () => {
    const result = clienteSchema.safeParse({ ...baseValido, identificacion: 'V1' })
    expect(result.success).toBe(false)
  })

  it('rechaza identificacion solo con numeros sin prefijo (menos de 6 digitos)', () => {
    // sanitizeCedula agrega V solo para 6-8 digitos; 4 digitos quedan sin prefijo → invalido
    const result = clienteSchema.safeParse({ ...baseValido, identificacion: '1234' })
    expect(result.success).toBe(false)
  })

  it('rechaza nombre menor a 3 caracteres', () => {
    const result = clienteSchema.safeParse({ ...baseValido, nombre: 'AB' })
    expect(result.success).toBe(false)
  })

  it('rechaza limite_credito_usd negativo', () => {
    const result = clienteSchema.safeParse({ ...baseValido, limite_credito_usd: -1 })
    expect(result.success).toBe(false)
  })
})

describe('clienteSchema — campos opcionales', () => {
  it('acepta sin direccion ni telefono', () => {
    const result = clienteSchema.safeParse({
      identificacion: 'V22448021',
      nombre: 'Juan Perez',
      limite_credito_usd: 0,
      is_active: true,
    })
    expect(result.success).toBe(true)
  })

  it('acepta con direccion y telefono', () => {
    const result = clienteSchema.safeParse({
      ...baseValido,
      direccion: 'Av. Principal 123',
      telefono: '0414-1234567',
    })
    expect(result.success).toBe(true)
  })
})
