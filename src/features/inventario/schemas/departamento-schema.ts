import { z } from 'zod'

export const departamentoSchema = z.object({
  codigo: z
    .string()
    .min(1, 'El codigo es requerido')
    .regex(/^[1-9]\d*$/, 'Solo numeros enteros positivos, sin ceros iniciales'),
  nombre: z
    .string()
    .min(3, 'Minimo 3 caracteres')
    .transform((v) => v.toUpperCase()),
  descripcion: z.string().optional().default(''),
  prioridad_visual: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
})

export type DepartamentoFormValues = z.infer<typeof departamentoSchema>
