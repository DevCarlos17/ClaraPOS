import { z } from 'zod'

export const cxcImportRowSchema = z.object({
  identificacion: z
    .string()
    .min(3, 'La identificacion debe tener al menos 3 caracteres')
    .refine((v) => !/[<>]/.test(v), 'La identificacion no puede contener etiquetas HTML')
    .transform((v) => v.toUpperCase().trim()),
  nro_documento: z
    .string()
    .min(1, 'El numero de documento es requerido')
    .refine((v) => !/[<>]/.test(v), 'El nro_documento no puede contener etiquetas HTML')
    .transform((v) => v.toUpperCase().trim()),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD (ej: 2024-01-15)'),
  monto_usd: z.coerce
    .number({ error: 'El monto debe ser un numero' })
    .positive('El monto debe ser mayor a 0'),
  tasa: z.coerce
    .number({ error: 'La tasa debe ser un numero' })
    .positive('La tasa debe ser mayor a 0')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  descripcion: z
    .string()
    .optional()
    .transform((v) => v?.trim() || '')
    .refine((v) => !/[<>]/.test(v), 'La descripcion no puede contener etiquetas HTML'),
})

export type CxcImportRow = z.infer<typeof cxcImportRowSchema>

/** Resultado por fila despues de intentar importar */
export type CxcImportRowResult =
  | { fila: number; ok: true; nro_factura: string; cliente_nombre: string }
  | { fila: number; ok: false; errores: string[]; nro_documento: string; identificacion: string }

export interface CxcImportSummary {
  exitosos: number
  fallidos: Extract<CxcImportRowResult, { ok: false }>[]
}

/** Mapa de aliases para el CSV/Excel parser */
export const CXC_CSV_HEADER_MAP: Record<string, keyof CxcImportRow> = {
  identificacion: 'identificacion',
  cedula: 'identificacion',
  rif: 'identificacion',
  cliente: 'identificacion',
  nro_documento: 'nro_documento',
  nro_factura: 'nro_documento',
  factura: 'nro_documento',
  numero: 'nro_documento',
  documento: 'nro_documento',
  fecha: 'fecha',
  fecha_factura: 'fecha',
  monto_usd: 'monto_usd',
  monto: 'monto_usd',
  importe: 'monto_usd',
  total: 'monto_usd',
  tasa: 'tasa',
  tasa_cambio: 'tasa',
  descripcion: 'descripcion',
  observacion: 'descripcion',
  concepto: 'descripcion',
}
