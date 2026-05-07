import { z } from 'zod'

export const nivelPrecioSchema = z.object({
  nombre: z
    .string()
    .min(1, 'Requerido')
    .max(50, 'Maximo 50 caracteres')
    .transform((v) => v.toUpperCase()),
  porcentaje_defecto: z
    .number({ message: 'Debe ser un numero' })
    .min(0, 'No puede ser negativo')
    .max(1000, 'No puede superar 1000%'),
})

export type NivelPrecioFormValues = z.infer<typeof nivelPrecioSchema>
