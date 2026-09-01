import { traspasoSchema } from '../traspaso-schema'

const BASE_VALID = {
  deposito_origen_id: 'dep-A',
  deposito_destino_id: 'dep-B',
  observacion: '',
  lineas: [{ producto_id: 'prod-1', cantidad: 4 }],
}

describe('traspasoSchema — TRI/Traspaso Atomico Individual, TRI/Traspaso por Lote', () => {
  it('acepta un traspaso individual valido (1 linea, depositos distintos)', () => {
    const result = traspasoSchema.safeParse(BASE_VALID)
    expect(result.success).toBe(true)
  })

  it('acepta un traspaso por lote valido (N lineas)', () => {
    const result = traspasoSchema.safeParse({
      ...BASE_VALID,
      lineas: [
        { producto_id: 'prod-1', cantidad: 2 },
        { producto_id: 'prod-2', cantidad: 3 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rechaza cuando falta deposito_origen_id', () => {
    const result = traspasoSchema.safeParse({ ...BASE_VALID, deposito_origen_id: '' })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta deposito_destino_id', () => {
    const result = traspasoSchema.safeParse({ ...BASE_VALID, deposito_destino_id: '' })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando deposito_origen_id === deposito_destino_id (mismo deposito)', () => {
    const result = traspasoSchema.safeParse({
      ...BASE_VALID,
      deposito_origen_id: 'dep-A',
      deposito_destino_id: 'dep-A',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('deposito_destino_id'))
      expect(issue).toBeDefined()
    }
  })

  it('rechaza cuando no hay ninguna linea', () => {
    const result = traspasoSchema.safeParse({ ...BASE_VALID, lineas: [] })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando una linea no tiene producto_id', () => {
    const result = traspasoSchema.safeParse({
      ...BASE_VALID,
      lineas: [{ producto_id: '', cantidad: 4 }],
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando la cantidad de una linea es 0 o negativa', () => {
    const result = traspasoSchema.safeParse({
      ...BASE_VALID,
      lineas: [{ producto_id: 'prod-1', cantidad: 0 }],
    })
    expect(result.success).toBe(false)

    const negativo = traspasoSchema.safeParse({
      ...BASE_VALID,
      lineas: [{ producto_id: 'prod-1', cantidad: -1 }],
    })
    expect(negativo.success).toBe(false)
  })

  it('observacion es opcional', () => {
    const { observacion: _observacion, ...sinObservacion } = BASE_VALID
    const result = traspasoSchema.safeParse(sinObservacion)
    expect(result.success).toBe(true)
  })
})
