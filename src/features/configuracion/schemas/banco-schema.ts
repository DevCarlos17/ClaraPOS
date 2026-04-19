import { z } from 'zod'

export const bancoSchema = z.object({
  nombre_banco: z
    .string()
    .min(2, 'Minimo 2 caracteres')
    .transform((v) => v.toUpperCase()),
  nro_cuenta: z
    .string()
    .min(5, 'Minimo 5 caracteres'),
  tipo_cuenta: z
    .enum(['CORRIENTE', 'AHORRO', 'DIGITAL'])
    .optional(),
  titular: z
    .string()
    .min(3, 'Minimo 3 caracteres')
    .transform((v) => v.toUpperCase()),
  titular_documento: z
    .string()
    .optional()
    .transform((v) => v?.toUpperCase()),
  active: z.boolean().default(true),
  cuenta_contable_id: z.string().optional(),
})

export type BancoFormValues = z.infer<typeof bancoSchema>
