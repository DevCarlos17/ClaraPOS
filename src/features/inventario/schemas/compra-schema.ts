import { z } from 'zod'

export const lineaCompraSchema = z.object({
  producto_id: z.string().min(1, 'Selecciona un producto'),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
  costo_unitario_usd: z.number().positive('El costo debe ser mayor a 0'),
  tipo_impuesto: z.enum(['Gravable', 'Exento', 'Exonerado']).default('Exento'),
  impuesto_pct: z.number().min(0).max(100).default(0),
})

export const compraHeaderSchema = z.object({
  proveedor_id: z.string().min(1, 'Selecciona un proveedor'),
  tasa: z.number().positive('La tasa debe ser mayor a 0'),
  fecha_factura: z.string().min(1, 'La fecha es requerida'),
  nro_factura: z.string().min(1, 'El numero de factura es requerido'),
  nro_control: z.string().optional(),
  moneda: z.enum(['USD', 'BS']),
})

export type LineaCompraValues = z.infer<typeof lineaCompraSchema>
export type CompraHeaderValues = z.infer<typeof compraHeaderSchema>
