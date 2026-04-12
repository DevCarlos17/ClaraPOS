import { z } from 'zod'

export const depositoSchema = z.object({
  nombre: z
    .string()
    .min(2, 'Minimo 2 caracteres')
    .transform((v) => v.toUpperCase()),
  direccion: z.string().optional(),
  es_principal: z.boolean().default(false),
  permite_venta: z.boolean().default(true),
})

export type DepositoFormValues = z.infer<typeof depositoSchema>
