import { z } from 'zod'

export const paymentMethodSchema = z.object({
  name: z
    .string()
    .min(2, 'Minimo 2 caracteres')
    .transform((v) => v.toUpperCase()),
  currency: z.enum(['USD', 'BS'], { message: 'Seleccione una moneda' }),
  tipo: z.enum(
    ['EFECTIVO', 'TRANSFERENCIA', 'PUNTO', 'PAGO_MOVIL', 'ZELLE', 'DIVISA_DIGITAL', 'OTRO'],
    { message: 'Seleccione un tipo' }
  ),
  banco_empresa_id: z.string().optional(),
  requiere_referencia: z.boolean().default(false),
  active: z.boolean().default(true),
  // 0069: atributos operativos
  deposito_directo: z.boolean().default(false),
  comision_pct: z.string().default('0'),
  usa_pos: z.boolean().default(true),
  usa_cxc: z.boolean().default(true),
  usa_cxp: z.boolean().default(true),
})

export type PaymentMethodFormValues = z.infer<typeof paymentMethodSchema>
