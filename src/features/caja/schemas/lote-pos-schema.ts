import { z } from 'zod'

export const lotePosSchema = z.object({
  metodo_cobro_id: z.string().uuid(),
  nro_lote: z.string().min(1, 'El numero de lote es requerido'),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  moneda_id: z.string().uuid(),
})

export type LotePosFormValues = z.infer<typeof lotePosSchema>
