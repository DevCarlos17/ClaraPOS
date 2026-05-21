import { lineaVentaSchema, pagoEntrySchema } from '@/features/ventas/schemas/venta-schema'

describe('lineaVentaSchema', () => {
  const validLinea = {
    producto_id: 'prod-uuid-123',
    codigo: 'PROD-001',
    nombre: 'Producto de prueba',
    tipo: 'P',
    cantidad: 2,
    precio_unitario_usd: 10.5,
    stock_actual: 50,
    es_decimal: false,
    tipo_impuesto: 'Gravable' as const,
    impuesto_pct: 16,
  }

  it('passes with a valid full object', () => {
    expect(lineaVentaSchema.safeParse(validLinea).success).toBe(true)
  })

  it('fails when producto_id is empty string', () => {
    const result = lineaVentaSchema.safeParse({ ...validLinea, producto_id: '' })
    expect(result.success).toBe(false)
  })

  it('fails when cantidad is 0', () => {
    const result = lineaVentaSchema.safeParse({ ...validLinea, cantidad: 0 })
    expect(result.success).toBe(false)
  })

  it('fails when precio_unitario_usd is negative', () => {
    const result = lineaVentaSchema.safeParse({ ...validLinea, precio_unitario_usd: -1 })
    expect(result.success).toBe(false)
  })

  it('defaults stock_actual to 0 when missing', () => {
    const { stock_actual: _, ...withoutStock } = validLinea
    const result = lineaVentaSchema.safeParse(withoutStock)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.stock_actual).toBe(0)
  })

  it('defaults es_decimal to true when missing', () => {
    const { es_decimal: _, ...withoutEsDecimal } = validLinea
    const result = lineaVentaSchema.safeParse(withoutEsDecimal)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.es_decimal).toBe(true)
  })

  it('defaults tipo_impuesto to "Exento" when missing', () => {
    const { tipo_impuesto: _, ...withoutTipo } = validLinea
    const result = lineaVentaSchema.safeParse(withoutTipo)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.tipo_impuesto).toBe('Exento')
  })

  it('defaults impuesto_pct to 0 when missing', () => {
    const { impuesto_pct: _, ...withoutPct } = validLinea
    const result = lineaVentaSchema.safeParse(withoutPct)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.impuesto_pct).toBe(0)
  })
})

describe('pagoEntrySchema', () => {
  const validPagoUSD = {
    metodo_cobro_id: 'metodo-uuid-123',
    metodo_nombre: 'Efectivo USD',
    moneda: 'USD' as const,
    monto: 50,
    referencia: 'REF-001',
  }

  it('passes with a valid USD payment', () => {
    expect(pagoEntrySchema.safeParse(validPagoUSD).success).toBe(true)
  })

  it('passes with a valid BS payment', () => {
    const pagoBs = { ...validPagoUSD, moneda: 'BS' as const, metodo_nombre: 'Efectivo Bs' }
    expect(pagoEntrySchema.safeParse(pagoBs).success).toBe(true)
  })

  it('fails when metodo_cobro_id is empty', () => {
    const result = pagoEntrySchema.safeParse({ ...validPagoUSD, metodo_cobro_id: '' })
    expect(result.success).toBe(false)
  })

  it('fails when monto is 0', () => {
    const result = pagoEntrySchema.safeParse({ ...validPagoUSD, monto: 0 })
    expect(result.success).toBe(false)
  })

  it('passes when referencia is absent (optional)', () => {
    const { referencia: _, ...withoutRef } = validPagoUSD
    expect(pagoEntrySchema.safeParse(withoutRef).success).toBe(true)
  })
})
