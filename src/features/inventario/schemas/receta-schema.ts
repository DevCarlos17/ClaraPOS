import { z } from 'zod'

export const recetaSchema = z.object({
  servicio_id: z.string().min(1, 'Selecciona un servicio'),
  producto_id: z.string().min(1, 'Selecciona un producto'),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
})

export type RecetaFormValues = z.infer<typeof recetaSchema>
