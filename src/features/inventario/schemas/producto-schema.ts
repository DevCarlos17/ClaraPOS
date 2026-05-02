import { z } from 'zod'

export const productoSchema = z
  .object({
    codigo: z.string().min(1, 'El codigo es requerido').transform((v) => v.toUpperCase()),
    tipo: z.enum(['P', 'S', 'C'], { message: 'Selecciona Producto, Servicio o Combo' }),
    nombre: z.string().min(3, 'Minimo 3 caracteres').transform((v) => v.toUpperCase()),
    departamento_id: z.string().min(1, 'Selecciona un departamento'),
    costo_usd: z.number().min(0, 'El costo no puede ser negativo'),
    precio_venta_usd: z.number().min(0, 'El precio no puede ser negativo'),
    precio_mayor_usd: z.number().nullable().optional(),
    stock_minimo: z.number().min(0, 'No puede ser negativo'),
    tipo_impuesto: z.enum(['Gravable', 'Exento', 'Exonerado']).default('Exento'),
    is_active: z.boolean().default(true),
    ubicacion: z.string().optional().default(''),
    presentacion: z.string().optional().default(''),
    codigo_barras: z.string().max(100).optional().default(''),
  })
  .refine(
    (data) => {
      if (data.tipo === 'C') return true
      return data.precio_venta_usd >= data.costo_usd
    },
    {
      message: 'El precio de venta debe ser mayor o igual al costo',
      path: ['precio_venta_usd'],
    }
  )
  .refine(
    (data) => {
      if (data.precio_mayor_usd == null) return true
      return data.precio_mayor_usd <= data.precio_venta_usd
    },
    {
      message: 'El precio mayor debe ser menor o igual al precio de venta',
      path: ['precio_mayor_usd'],
    }
  )

export type ProductoFormValues = z.infer<typeof productoSchema>
