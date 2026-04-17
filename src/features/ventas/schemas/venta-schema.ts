import { z } from 'zod'

export const lineaVentaSchema = z.object({
  producto_id: z.string().min(1, 'Producto requerido'),
  codigo: z.string(),
  nombre: z.string(),
  tipo: z.string(),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
  precio_unitario_usd: z.number().min(0, 'El precio no puede ser negativo'),
  stock_actual: z.number().min(0).default(0),
  es_decimal: z.boolean().default(true),
})

export type LineaVentaForm = z.infer<typeof lineaVentaSchema>

export const pagoEntrySchema = z.object({
  metodo_cobro_id: z.string().min(1, 'Metodo de pago requerido'),
  metodo_nombre: z.string(),
  moneda: z.enum(['USD', 'BS']),
  monto: z.number().positive('El monto debe ser mayor a 0'),
  referencia: z.string().optional(),
})

export type PagoEntryForm = z.infer<typeof pagoEntrySchema>
