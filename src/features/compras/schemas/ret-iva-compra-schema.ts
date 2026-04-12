import { z } from 'zod'

export const retIvaCompraSchema = z.object({
  factura_compra_id: z.string().min(1, 'La factura de compra es requerida'),
  proveedor_id: z.string().min(1, 'El proveedor es requerido'),
  nro_comprobante: z.string().min(1, 'El numero de comprobante es requerido'),
  fecha_comprobante: z.string().min(1, 'La fecha del comprobante es requerida'),
  base_imponible: z
    .number({ message: 'La base imponible es requerida' })
    .positive('Debe ser mayor a 0'),
  porcentaje_iva: z
    .number({ message: 'El porcentaje de IVA es requerido' })
    .min(0, 'Debe ser mayor o igual a 0'),
  monto_iva: z
    .number({ message: 'El monto de IVA es requerido' })
    .positive('Debe ser mayor a 0'),
  porcentaje_retencion: z
    .number({ message: 'El porcentaje de retencion es requerido' })
    .min(0, 'Debe ser mayor o igual a 0'),
  monto_retenido: z
    .number({ message: 'El monto retenido es requerido' })
    .positive('Debe ser mayor a 0'),
})

export type RetIvaCompraFormValues = z.infer<typeof retIvaCompraSchema>
