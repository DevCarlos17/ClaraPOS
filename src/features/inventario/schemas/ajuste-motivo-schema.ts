import { z } from 'zod'

export const ajusteMotivoSchema = z.object({
  nombre: z
    .string()
    .min(1, 'Requerido')
    .transform((v) => v.toUpperCase()),
  operacion_base: z.enum(['SUMA', 'RESTA', 'NEUTRO'], { message: 'Debe ser SUMA, RESTA o NEUTRO' }),
  afecta_costo: z.boolean().default(false),
})

export type AjusteMotivoFormValues = z.infer<typeof ajusteMotivoSchema>
