import { z } from 'zod'

export const MODULOS_ORIGEN = [
  'VENTA', 'PAGO_CXC', 'COMPRA', 'PAGO_CXP', 'GASTO',
  'NCR_VENTA', 'NCR_COMPRA', 'NDB', 'MANUAL', 'REVERSO',
] as const

export const ESTADOS_ASIENTO = ['PENDIENTE', 'CONCILIADO', 'ANULADO'] as const

export const MODULO_LABELS: Record<string, string> = {
  VENTA: 'Venta',
  PAGO_CXC: 'Pago CxC',
  COMPRA: 'Compra',
  PAGO_CXP: 'Pago CxP',
  GASTO: 'Gasto',
  NCR_VENTA: 'Nota Credito',
  NCR_COMPRA: 'NC Compra',
  NDB: 'Nota Debito',
  MANUAL: 'Manual',
  REVERSO: 'Reverso',
}

// Schema para movimiento manual (exige partida doble)
export const lineaAsientoSchema = z.object({
  cuenta_contable_id: z.string().uuid('Selecciona una cuenta'),
  monto: z.number().refine((v) => v !== 0, 'El monto no puede ser cero'),
  detalle: z.string().min(3, 'El detalle es requerido'),
})

export const asientoManualSchema = z.object({
  doc_origen_ref: z.string().optional(),
  lineas: z
    .array(lineaAsientoSchema)
    .min(2, 'Se requieren al menos dos lineas')
    .refine(
      (lineas) => Math.abs(lineas.reduce((sum, l) => sum + l.monto, 0)) < 0.01,
      'Las lineas deben sumar cero (partida doble)'
    ),
})

export type AsientoManualFormValues = z.infer<typeof asientoManualSchema>
