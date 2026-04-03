import { z } from 'zod'

export const tasaSchema = z.object({
  valor: z
    .number({ message: 'El valor es requerido' })
    .positive('La tasa debe ser mayor a 0')
    .max(999999, 'Valor demasiado alto'),
})

export type TasaFormValues = z.infer<typeof tasaSchema>
