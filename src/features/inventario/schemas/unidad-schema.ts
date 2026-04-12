import { z } from 'zod'

export const unidadSchema = z.object({
  nombre: z
    .string()
    .min(1, 'Requerido')
    .transform((v) => v.toUpperCase()),
  abreviatura: z
    .string()
    .min(1, 'Requerido')
    .max(5, 'Maximo 5 caracteres')
    .transform((v) => v.toUpperCase()),
  es_decimal: z.boolean().default(false),
})

export type UnidadFormValues = z.infer<typeof unidadSchema>
