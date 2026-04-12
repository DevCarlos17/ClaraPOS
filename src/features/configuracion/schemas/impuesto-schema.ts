import { z } from 'zod'

export const impuestoSchema = z.object({
  nombre: z
    .string()
    .min(1, 'Requerido')
    .transform((v) => v.toUpperCase()),
  tipo_tributo: z.enum(['IVA', 'IGTF'], { message: 'Debe ser IVA o IGTF' }),
  porcentaje: z
    .number({ message: 'Debe ser un numero' })
    .min(0, 'No puede ser negativo')
    .max(100, 'No puede superar 100%'),
  codigo_seniat: z.string().optional(),
  descripcion: z.string().optional(),
})

export type ImpuestoFormValues = z.infer<typeof impuestoSchema>
