import { z } from 'zod'

export const paymentMethodSchema = z.object({
  name: z
    .string()
    .min(2, 'Minimo 2 caracteres')
    .transform((v) => v.toUpperCase()),
  currency: z.enum(['USD', 'BS'], { message: 'Seleccione una moneda' }),
  active: z.boolean().default(true),
})

export type PaymentMethodFormValues = z.infer<typeof paymentMethodSchema>
