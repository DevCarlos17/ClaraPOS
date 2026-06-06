import { z } from 'zod'
import { sanitizeCedula, isValidCedula, normalizarDecimalComa } from '@/lib/identity'
import { todayStr } from '@/lib/dates'

export const cxcImportRowSchema = z.object({
  identificacion: z
    .string()
    .min(3, 'La identificacion debe tener al menos 3 caracteres')
    .transform(sanitizeCedula)
    .refine(isValidCedula, 'Identificacion invalida. Ej: V22448021 o E12345678'),
  nro_documento: z
    .string()
    .min(1, 'El numero de documento es requerido')
    .refine(
      (v) => /^[A-Za-z0-9\-\/\.]+$/.test(v),
      'El nro_documento solo puede contener letras (A-Z), numeros (0-9), guiones, barras y puntos'
    )
    .transform((v) => v.toUpperCase().trim()),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD (ej: 2024-01-15)')
    .refine((v) => {
      const [year, month, day] = v.split('-').map(Number)
      const fecha = new Date(year, month - 1, day)
      // Detectar rollover de fechas invalidas (ej: 2024-02-30 → 2024-03-01)
      if (
        fecha.getFullYear() !== year ||
        fecha.getMonth() !== month - 1 ||
        fecha.getDate() !== day
      ) return false
      // No permitir fechas futuras (comparar contra fecha VET)
      const [hy, hm, hd] = todayStr().split('-').map(Number)
      const hoy = new Date(hy, hm - 1, hd)
      return fecha <= hoy
    }, 'La fecha no es valida o es posterior a la fecha actual'),
  monto_usd: z.preprocess(
    normalizarDecimalComa,
    z.coerce
      .number({ error: 'El monto debe ser un numero. Use coma como decimal (ej: 250,50)' })
      .positive('El monto debe ser mayor a 0')
  ),
  tasa: z.preprocess(
    normalizarDecimalComa,
    z.coerce
      .number({ error: 'La tasa debe ser un numero. Use coma como decimal (ej: 36,50)' })
      .positive('La tasa debe ser mayor a 0')
      .optional()
      .or(z.literal('').transform(() => undefined))
  ),
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
