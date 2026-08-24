import { z } from 'zod'

// PR-3 (metodo-cobro-deducciones): N conceptos de deduccion por metodo de pago
// bancario (comision de pasarela, retencion ISLR, etc.). Reemplaza el campo
// unico comision_pct para metodos bancarios.
export const metodoCobroDeduccionSchema = z.object({
  id: z.string().uuid().optional(), // undefined = fila nueva, aun no persistida
  concepto: z.string().min(1, 'Requerido'),
  tipo: z.enum(['COMISION', 'ISLR', 'OTRO'], { message: 'Seleccione un tipo' }),
  porcentaje: z.string().refine((v) => {
    const n = Number(v)
    return !isNaN(n) && n >= 0 && n <= 100
  }, 'Debe estar entre 0 y 100'),
  cuenta_gasto_id: z.string().uuid('Seleccione una cuenta'),
  is_active: z.boolean().default(true),
})

export type MetodoCobroDeduccionFormValues = z.infer<typeof metodoCobroDeduccionSchema>

export const paymentMethodSchema = z
  .object({
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
    // Fix qa/metodo-pago-hereda-moneda-banco: moneda REAL del banco
    // seleccionado (resuelta por el form desde `useBancosActivos`, nunca
    // ingresada por el usuario). Solo existe para el refine cruzado de abajo
    // — jamas se persiste. undefined = sin banco, o banco aun no resuelto.
    banco_moneda: z.enum(['USD', 'BS']).optional(),
    requiere_referencia: z.boolean().default(false),
    active: z.boolean().default(true),
    // 0069: atributos operativos
    deposito_directo: z.boolean().default(false),
    comision_pct: z.string().default('0'),
    usa_pos: z.boolean().default(true),
    usa_cxc: z.boolean().default(true),
    usa_cxp: z.boolean().default(true),
    // 0079: consolidar lotes POS en un traspaso (true) o uno por lote (false)
    consolidar_lotes: z.boolean().default(true),
    // PR-3: N conceptos de deduccion bancaria (solo aplica si banco_empresa_id esta presente)
    deducciones: z.array(metodoCobroDeduccionSchema).default([]),
  })
  .refine((d) => !d.banco_empresa_id || !d.banco_moneda || d.currency === d.banco_moneda, {
    message: 'La moneda debe coincidir con la moneda del banco seleccionado',
    path: ['currency'],
  })

export type PaymentMethodFormValues = z.infer<typeof paymentMethodSchema>
