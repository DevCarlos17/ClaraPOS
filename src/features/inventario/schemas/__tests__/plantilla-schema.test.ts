import { plantillaSchema } from '../plantilla-schema'

const BASE_VALID = {
  nombre: 'reposicion mostrador',
  descripcion: 'Set mensual',
  productoIds: ['prod-1', 'prod-2'],
}

describe('plantillaSchema — Crear Plantilla/Plantilla creada correctamente', () => {
  it('acepta una plantilla valida y normaliza nombre a mayusculas', () => {
    const result = plantillaSchema.safeParse(BASE_VALID)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.nombre).toBe('REPOSICION MOSTRADOR')
    }
  })

  it('acepta multiples productos en productoIds', () => {
    const result = plantillaSchema.safeParse({
      ...BASE_VALID,
      productoIds: ['prod-1', 'prod-2', 'prod-3'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.productoIds).toHaveLength(3)
    }
  })

  it('descripcion es opcional', () => {
    const { descripcion: _descripcion, ...sinDescripcion } = BASE_VALID
    const result = plantillaSchema.safeParse(sinDescripcion)
    expect(result.success).toBe(true)
  })
})

describe('plantillaSchema — Rechazo sin nombre', () => {
  it('rechaza cuando nombre esta vacio', () => {
    const result = plantillaSchema.safeParse({ ...BASE_VALID, nombre: '' })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando nombre tiene solo espacios', () => {
    const result = plantillaSchema.safeParse({ ...BASE_VALID, nombre: '   ' })
    expect(result.success).toBe(false)
  })
})

describe('plantillaSchema — Rechazo sin productos', () => {
  it('rechaza cuando productoIds esta vacio', () => {
    const result = plantillaSchema.safeParse({ ...BASE_VALID, productoIds: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('productoIds'))
      expect(issue).toBeDefined()
    }
  })
})
