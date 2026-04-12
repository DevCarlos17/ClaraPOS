import { z } from 'zod'

export const conversionSchema = z.object({
  unidad_mayor_id: z.string().min(1, 'Seleccione la unidad mayor'),
  unidad_menor_id: z.string().min(1, 'Seleccione la unidad menor'),
  factor: z
    .number({ message: 'Debe ser un numero' })
    .positive('El factor debe ser mayor a 0'),
})

export type ConversionFormValues = z.infer<typeof conversionSchema>
