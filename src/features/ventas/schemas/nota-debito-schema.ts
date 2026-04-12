import { z } from 'zod'

// ─── Linea de detalle ────────────────────────────────────────

export const lineaNotaDebitoSchema = z.object({
  descripcion: z.string().min(1, 'La descripcion es requerida'),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
  precio_unitario_usd: z.number().positive('El precio debe ser mayor a 0'),
  tipo_impuesto: z.enum(['GRAVABLE', 'EXENTO', 'EXONERADO']).optional(),
  impuesto_pct: z.number().min(0, 'El porcentaje no puede ser negativo').optional(),
})

export type LineaNotaDebitoForm = z.infer<typeof lineaNotaDebitoSchema>

// ─── Cabecera de nota de debito ──────────────────────────────

export const notaDebitoSchema = z.object({
  cliente_id: z.string().min(1, 'El cliente es requerido'),
  venta_id: z.string().optional(),
  motivo: z.string().min(3, 'El motivo debe tener al menos 3 caracteres'),
  tasa: z.number({ message: 'La tasa es requerida' }).positive('La tasa debe ser mayor a 0'),
  lineas: z
    .array(lineaNotaDebitoSchema)
    .min(1, 'Debe agregar al menos una linea'),
})

export type NotaDebitoFormValues = z.infer<typeof notaDebitoSchema>
