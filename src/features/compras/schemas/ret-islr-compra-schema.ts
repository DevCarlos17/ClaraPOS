import { z } from 'zod'

export const retIslrCompraSchema = z.object({
  factura_compra_id: z.string().min(1, 'La factura de compra es requerida'),
  proveedor_id: z.string().min(1, 'El proveedor es requerido'),
  nro_comprobante: z.string().min(1, 'El numero de comprobante es requerido'),
  fecha_comprobante: z.string().min(1, 'La fecha del comprobante es requerida'),
  base_imponible_bs: z
    .number({ message: 'La base imponible en Bs es requerida' })
    .positive('Debe ser mayor a 0'),
  porcentaje_retencion: z
    .number({ message: 'El porcentaje de retencion es requerido' })
    .min(0, 'Debe ser mayor o igual a 0'),
  monto_retenido_bs: z
    .number({ message: 'El monto retenido en Bs es requerido' })
    .positive('Debe ser mayor a 0'),
})

export type RetIslrCompraFormValues = z.infer<typeof retIslrCompraSchema>
