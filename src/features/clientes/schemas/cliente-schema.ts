import { z } from 'zod'

export const clienteSchema = z.object({
  identificacion: z
    .string()
    .min(3, 'Minimo 3 caracteres')
    .max(20, 'Maximo 20 caracteres')
    .transform((v) => v.toUpperCase().trim()),
  nombre: z
    .string()
    .min(3, 'Minimo 3 caracteres')
    .transform((v) => v.toUpperCase().trim()),
  direccion: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  telefono: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  limite_credito_usd: z.number().min(0, 'Debe ser mayor o igual a 0').default(0),
  is_active: z.boolean().default(true),
})

export type ClienteFormValues = z.infer<typeof clienteSchema>
