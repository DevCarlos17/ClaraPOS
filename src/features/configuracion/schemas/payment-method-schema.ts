import { z } from 'zod'

export const paymentMethodSchema = z.object({
  name: z
    .string()
    .min(2, 'Minimo 2 caracteres')
    .transform((v) => v.toUpperCase()),
  currency: z.enum(['USD', 'BS'], { message: 'Seleccione una moneda' }),
  tipo: z.enum(
    ['EFECTIVO', 'TRANSFERENCIA', 'PUNTO', 'PAGO_MOVIL', 'ZELLE', 'DIVISA_DIGITAL', 'OTRO'],
    { message: 'Seleccione un tipo' }
  ),
  banco_empresa_id: z.string().optional(),
  requiere_referencia: z.boolean().default(false),
  active: z.boolean().default(true),
})

export type PaymentMethodFormValues = z.infer<typeof paymentMethodSchema>
