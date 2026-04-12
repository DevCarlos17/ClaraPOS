import { z } from 'zod'

export const marcaSchema = z.object({
  nombre: z
    .string()
    .min(2, 'Minimo 2 caracteres')
    .transform((v) => v.toUpperCase()),
  descripcion: z.string().optional(),
})

export type MarcaFormValues = z.infer<typeof marcaSchema>
