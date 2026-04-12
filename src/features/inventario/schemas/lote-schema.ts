import { z } from 'zod'

export const loteSchema = z.object({
  producto_id: z.string().min(1, 'Seleccione un producto'),
  deposito_id: z.string().min(1, 'Seleccione un deposito'),
  nro_lote: z
    .string()
    .min(1, 'Requerido')
    .transform((v) => v.toUpperCase()),
  fecha_fabricacion: z.string().optional(),
  fecha_vencimiento: z.string().optional(),
  cantidad_inicial: z
    .number({ message: 'Debe ser un numero' })
    .positive('La cantidad debe ser mayor a 0'),
  costo_unitario: z
    .number({ message: 'Debe ser un numero' })
    .nonnegative('No puede ser negativo')
    .optional(),
})

export type LoteFormValues = z.infer<typeof loteSchema>
