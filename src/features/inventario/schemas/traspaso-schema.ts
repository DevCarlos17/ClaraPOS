import { z } from 'zod'

const traspasoLineaSchema = z.object({
  producto_id: z.string().min(1, 'Seleccione un producto'),
  cantidad: z
    .number({ message: 'Debe ser un numero' })
    .positive('La cantidad debe ser mayor a 0'),
})

export const traspasoSchema = z
  .object({
    deposito_origen_id: z.string().min(1, 'Seleccione el deposito de origen'),
    deposito_destino_id: z.string().min(1, 'Seleccione el deposito de destino'),
    observacion: z.string().optional(),
    lineas: z
      .array(traspasoLineaSchema)
      .min(1, 'Debe agregar al menos una linea'),
  })
  .refine((data) => data.deposito_origen_id !== data.deposito_destino_id, {
    message: 'El deposito de origen y el deposito de destino deben ser diferentes',
    path: ['deposito_destino_id'],
  })

export type TraspasoFormValues = z.infer<typeof traspasoSchema>
export type TraspasoLineaFormValues = z.infer<typeof traspasoLineaSchema>
