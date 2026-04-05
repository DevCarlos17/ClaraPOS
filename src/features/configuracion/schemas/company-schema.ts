import { z } from 'zod'

export const companySchema = z.object({
  nombre: z
    .string()
    .min(2, 'Minimo 2 caracteres')
    .transform((v) => v.toUpperCase()),
  rif: z
    .string()
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal('')),
  direccion: z.string().optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  email: z
    .string()
    .email('Email invalido')
    .optional()
    .or(z.literal('')),
  nro_fiscal: z
    .string()
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal('')),
  regimen: z
    .string()
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal('')),
})

export type CompanyFormValues = z.infer<typeof companySchema>
