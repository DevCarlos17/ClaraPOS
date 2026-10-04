import { departamentoSchema } from '../departamento-schema'

describe('departamentoSchema — codigo asignado server-side (sentinel vacio)', () => {
  it('acepta un departamento sin la clave codigo (servidor es la unica fuente de verdad)', () => {
    const result = departamentoSchema.safeParse({ nombre: 'VIVERES', is_active: true })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.codigo).toBe('')
    }
  })

  it('acepta codigo vacio explicito como sentinel de pendiente', () => {
    const result = departamentoSchema.safeParse({ codigo: '', nombre: 'BEBIDAS', is_active: true })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.codigo).toBe('')
    }
  })

  it('rechaza cuando nombre tiene menos de 3 caracteres (regresion: regla de nombre intacta)', () => {
    const result = departamentoSchema.safeParse({ nombre: 'AB', is_active: true })
    expect(result.success).toBe(false)
  })
})
