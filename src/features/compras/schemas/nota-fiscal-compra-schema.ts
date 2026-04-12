import { z } from 'zod'

export const notaFiscalCompraSchema = z.object({
  proveedor_id: z.string().min(1, 'El proveedor es requerido'),
  factura_compra_id: z.string().optional(),
  tipo: z.enum(['NC', 'ND'], {
    message: 'Selecciona el tipo: Nota de Credito (NC) o Nota de Debito (ND)',
  }),
  nro_documento: z.string().min(1, 'El numero de documento es requerido'),
  motivo: z.string().min(3, 'El motivo debe tener al menos 3 caracteres'),
  tasa: z
    .number({ message: 'La tasa de cambio es requerida' })
    .positive('Debe ser mayor a 0'),
  afecta_inventario: z.boolean().default(false),
})

export type NotaFiscalCompraFormValues = z.infer<typeof notaFiscalCompraSchema>
