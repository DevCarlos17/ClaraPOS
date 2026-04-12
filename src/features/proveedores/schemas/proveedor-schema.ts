import { z } from 'zod'

export const proveedorSchema = z.object({
  razon_social: z.string().min(3, 'Minimo 3 caracteres'),
  rif: z.string().regex(/^[VEJPG]-\d{8}-\d$/, 'Formato invalido. Ej: J-00000000-0'),
  nombre_comercial: z.string().optional().default(''),
  direccion_fiscal: z.string().optional().default(''),
  ciudad: z.string().optional().default(''),
  telefono: z.string().optional().default(''),
  email: z.string().email('Correo invalido').or(z.literal('')).optional().default(''),
  tipo_contribuyente: z.enum(['ORDINARIO', 'ESPECIAL', 'FORMAL']).optional(),
  retiene_iva: z.boolean().default(false),
  retiene_islr: z.boolean().default(false),
  retencion_iva_pct: z.number().min(0).max(100).nullable().optional(),
  dias_credito: z.number().int().min(0).default(0),
  limite_credito_usd: z.number().min(0).default(0),
})

export type ProveedorFormData = z.infer<typeof proveedorSchema>
