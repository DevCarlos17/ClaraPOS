import { z } from 'zod'

export const cxpImportRowSchema = z.object({
  rif: z
    .string()
    .min(3, 'El RIF debe tener al menos 3 caracteres')
    .transform((v) => v.toUpperCase().trim()),
  nro_documento: z
    .string()
    .min(1, 'El numero de documento es requerido')
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
    .transform((v) => v?.trim() || ''),
})

export type CxpImportRow = z.infer<typeof cxpImportRowSchema>

/** Resultado por fila despues de intentar importar */
export type CxpImportRowResult =
  | { fila: number; ok: true; nro_factura: string; proveedor_nombre: string }
  | { fila: number; ok: false; errores: string[]; nro_documento: string; rif: string }

export interface CxpImportSummary {
  exitosos: number
  fallidos: Extract<CxpImportRowResult, { ok: false }>[]
}

/** Mapa de aliases para el CSV parser */
export const CXP_CSV_HEADER_MAP: Record<string, keyof CxpImportRow> = {
  rif: 'rif',
  proveedor: 'rif',
  identificacion: 'rif',
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
