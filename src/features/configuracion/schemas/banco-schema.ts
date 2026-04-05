import { z } from 'zod'

export const bancoSchema = z.object({
  banco: z
    .string()
    .min(2, 'Minimo 2 caracteres')
    .transform((v) => v.toUpperCase()),
  numero_cuenta: z
    .string()
    .min(5, 'Minimo 5 caracteres'),
  cedula_rif: z
    .string()
    .min(3, 'Minimo 3 caracteres')
    .transform((v) => v.toUpperCase()),
  active: z.boolean().default(true),
})

export type BancoFormValues = z.infer<typeof bancoSchema>
