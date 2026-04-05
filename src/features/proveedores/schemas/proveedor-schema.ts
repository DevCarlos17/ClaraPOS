import { z } from 'zod'

export const proveedorSchema = z.object({
  razon_social: z.string().min(3, 'Minimo 3 caracteres'),
  rif: z.string().regex(/^[VEJPG]-\d{8}-\d$/, 'Formato invalido. Ej: J-00000000-0'),
  direccion_fiscal: z.string().optional().default(''),
  telefono: z.string().optional().default(''),
  correo: z.string().email('Correo invalido').or(z.literal('')).optional().default(''),
  retiene_iva: z.boolean().default(false),
  retiene_islr: z.boolean().default(false),
})

export type ProveedorFormData = z.infer<typeof proveedorSchema>
