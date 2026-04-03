import { z } from 'zod'

export const kardexSchema = z.object({
  producto_id: z.string().min(1, 'Selecciona un producto'),
  tipo: z.enum(['E', 'S'], { message: 'Selecciona Entrada o Salida' }),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
  motivo: z.string().optional(),
})

export type KardexFormValues = z.infer<typeof kardexSchema>
