import { z } from 'zod'

const ajusteLineaSchema = z.object({
  producto_id: z.string().min(1, 'Seleccione un producto'),
  deposito_id: z.string().min(1, 'Seleccione un deposito'),
  cantidad: z
    .number({ message: 'Debe ser un numero' })
    .positive('La cantidad debe ser mayor a 0'),
  costo_unitario: z
    .number({ message: 'Debe ser un numero' })
    .nonnegative('No puede ser negativo')
    .optional(),
})

export const ajusteSchema = z.object({
  motivo_id: z.string().min(1, 'Seleccione un motivo'),
  fecha: z.string().min(1, 'Requerido'),
  observaciones: z.string().optional(),
  lineas: z
    .array(ajusteLineaSchema)
    .min(1, 'Debe agregar al menos una linea'),
})

export type AjusteFormValues = z.infer<typeof ajusteSchema>
export type AjusteLineaFormValues = z.infer<typeof ajusteLineaSchema>
