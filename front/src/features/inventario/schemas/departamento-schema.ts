import { z } from 'zod'

export const departamentoSchema = z.object({
  codigo: z
    .string()
    .min(1, 'El codigo es requerido')
    .regex(/^[A-Z0-9-]+$/, 'Solo mayusculas, numeros y guiones')
    .transform((v) => v.toUpperCase()),
  nombre: z
    .string()
    .min(3, 'Minimo 3 caracteres')
    .transform((v) => v.toUpperCase()),
  activo: z.boolean().default(true),
})

export type DepartamentoFormValues = z.infer<typeof departamentoSchema>
