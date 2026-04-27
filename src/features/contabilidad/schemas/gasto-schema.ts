import { z } from 'zod'

export const gastoPagoSchema = z.object({
  metodo_cobro_id: z.string().min(1, 'El metodo de pago es requerido'),
  banco_empresa_id: z.string().optional(),
  monto_usd: z
    .number({ message: 'El monto es requerido' })
    .positive('Debe ser mayor a 0'),
  referencia: z.string().optional().default(''),
})

export type GastoPagoValues = z.infer<typeof gastoPagoSchema>

export const gastoSchema = z.object({
  cuenta_id: z.string().min(1, 'La cuenta contable es requerida'),
  proveedor_id: z.string().optional(),
  nro_control: z.string().optional(),
  descripcion: z.string().min(3, 'La descripcion debe tener al menos 3 caracteres'),
  fecha: z.string().min(1, 'La fecha es requerida'),
  moneda_id: z.string().min(1, 'La moneda es requerida'),
  moneda_factura: z.enum(['USD', 'BS']).default('USD'),
  usa_tasa_paralela: z.boolean().default(false),
  tasa: z
    .number({ message: 'La tasa interna es requerida' })
    .positive('Debe ser mayor a 0'),
  tasa_proveedor: z
    .number()
    .positive('Debe ser mayor a 0')
    .optional(),
  monto_factura: z
    .number({ message: 'El monto es requerido' })
    .positive('Debe ser mayor a 0'),
  monto_usd: z
    .number({ message: 'El total contable USD es requerido' })
    .positive('Debe ser mayor a 0'),
  pagos: z.array(gastoPagoSchema).default([]),
  observaciones: z.string().optional().default(''),
})

export type GastoFormValues = z.infer<typeof gastoSchema>
