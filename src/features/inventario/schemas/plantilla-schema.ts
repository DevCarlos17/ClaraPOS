import { z } from 'zod'

export const plantillaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre es obligatorio')
    .transform((v) => v.toUpperCase()),
  descripcion: z.string().optional(),
  productoIds: z
    .array(z.string().min(1))
    .min(1, 'Debe seleccionar al menos un producto'),
})

export type PlantillaFormValues = z.infer<typeof plantillaSchema>
