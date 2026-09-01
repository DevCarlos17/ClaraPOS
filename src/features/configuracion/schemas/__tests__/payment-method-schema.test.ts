import { paymentMethodSchema } from '../payment-method-schema'

// Fix: metodo de pago debe heredar la moneda del banco vinculado (Engram
// qa/metodo-pago-hereda-moneda-banco/explore, obs #2253). El form resuelve
// `banco_moneda` desde `useBancosActivos` (banco.moneda) y lo pasa al parse
// SOLO para validacion cruzada — nunca se persiste. Backstop Zod: si hay
// banco Y se conoce su moneda, `currency` DEBE coincidir.

const base = {
  name: 'Transferencia Banco X',
  currency: 'USD' as const,
  tipo: 'TRANSFERENCIA' as const,
}

describe('paymentMethodSchema — moneda debe heredar la del banco vinculado', () => {
  it('rechaza cuando currency no coincide con la moneda del banco seleccionado', () => {
    const result = paymentMethodSchema.safeParse({
      ...base,
      currency: 'BS',
      banco_empresa_id: 'banco-1',
      banco_moneda: 'USD',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('currency')
      const messages = result.error.issues.map((i) => i.message)
      expect(messages).toContain('La moneda debe coincidir con la moneda del banco seleccionado')
    }
  })

  it('acepta cuando currency coincide con la moneda del banco', () => {
    const result = paymentMethodSchema.safeParse({
      ...base,
      currency: 'USD',
      banco_empresa_id: 'banco-1',
      banco_moneda: 'USD',
    })
    expect(result.success).toBe(true)
  })

  it('acepta metodos sin banco (ej. EFECTIVO) con cualquier moneda, sin validacion cruzada', () => {
    const result = paymentMethodSchema.safeParse({
      ...base,
      tipo: 'EFECTIVO',
      currency: 'BS',
      banco_empresa_id: undefined,
      banco_moneda: undefined,
    })
    expect(result.success).toBe(true)
  })

  it('acepta cuando hay banco pero banco_moneda no se proveyo (no se puede validar la coincidencia)', () => {
    const result = paymentMethodSchema.safeParse({
      ...base,
      currency: 'BS',
      banco_empresa_id: 'banco-1',
    })
    expect(result.success).toBe(true)
  })
})
