import { z } from 'zod'

export const cajaSchema = z.object({
  nombre: z
    .string()
    .min(2, 'Minimo 2 caracteres')
    .transform((v) => v.toUpperCase()),
  ubicacion: z.string().optional(),
  deposito_id: z.string().optional(),
  is_active: z.boolean().default(true),
})

export type CajaFormValues = z.infer<typeof cajaSchema>
