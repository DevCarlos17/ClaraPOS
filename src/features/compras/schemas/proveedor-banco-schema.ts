import { z } from 'zod'

export const proveedorBancoSchema = z.object({
  proveedor_id: z.string().min(1, 'El proveedor es requerido'),
  nombre_banco: z.string().min(1, 'El nombre del banco es requerido'),
  nro_cuenta: z.string().min(1, 'El numero de cuenta es requerido'),
  tipo_cuenta: z.enum(['CORRIENTE', 'AHORRO', 'DIGITAL']).optional(),
  titular: z.string().optional().default(''),
  titular_documento: z.string().optional().default(''),
  moneda_id: z.string().optional(),
})

export type ProveedorBancoFormValues = z.infer<typeof proveedorBancoSchema>
