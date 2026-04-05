import { z } from 'zod'

export const lineaCompraSchema = z.object({
  producto_id: z.string().min(1, 'Selecciona un producto'),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
  costo_unitario_usd: z.number().min(0, 'El costo debe ser mayor o igual a 0'),
})

export const compraHeaderSchema = z.object({
  proveedor_id: z.string().min(1, 'Selecciona un proveedor'),
  tasa: z.number().positive('La tasa debe ser mayor a 0'),
})

export type LineaCompraValues = z.infer<typeof lineaCompraSchema>
export type CompraHeaderValues = z.infer<typeof compraHeaderSchema>
