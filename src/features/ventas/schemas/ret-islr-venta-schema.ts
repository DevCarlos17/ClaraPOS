import { z } from 'zod'

export const retIslrVentaSchema = z.object({
  venta_id: z.string().min(1, 'La venta es requerida'),
  cliente_id: z.string().min(1, 'El cliente es requerido'),
  nro_comprobante: z.string().min(1, 'El numero de comprobante es requerido'),
  fecha_comprobante: z.string().min(1, 'La fecha del comprobante es requerida'),
  base_imponible_bs: z
    .number({ message: 'La base imponible es requerida' })
    .positive('La base imponible debe ser mayor a 0'),
  porcentaje_retencion: z
    .number({ message: 'El porcentaje de retencion es requerido' })
    .min(0, 'El porcentaje no puede ser negativo'),
  monto_retenido_bs: z
    .number({ message: 'El monto retenido es requerido' })
    .positive('El monto retenido debe ser mayor a 0'),
})

export type RetIslrVentaFormValues = z.infer<typeof retIslrVentaSchema>
