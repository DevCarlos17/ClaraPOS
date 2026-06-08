import { z } from 'zod'

// ── Regex reutilizables ────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
// Caracteres que habilitan inyección HTML/script
const HTML_CHARS_RE = /[<>"'`]/

// ── Factories de campos comunes ────────────────────────────────────────────────

/** UUID proveniente de un selector controlado por la app. */
function campoUuid(nombre: string) {
  return z
    .string()
    .min(1, `${nombre} es requerido`)
    .refine((v) => UUID_RE.test(v), `${nombre} tiene un formato inválido`)
}

/**
 * Número financiero: positivo, finito y con tope máximo para evitar
 * desbordamientos silenciosos en operaciones bimonetarias.
 */
function campoFinanciero(max: number, nombre: string) {
  return z
    .number()
    .refine((v) => Number.isFinite(v), `${nombre} no puede ser Infinito o NaN`)
    .positive(`${nombre} debe ser mayor a 0`)
    .max(max, `${nombre} fuera de rango (máx. ${max.toLocaleString('es-VE')})`)
}

/**
 * Campo de texto libre con:
 *  - longitud máxima controlada (DoS / almacenamiento)
 *  - rechazo de caracteres de inyección HTML/script
 */
function campoTexto(maxLen: number, nombre: string) {
  return z
    .string()
    .max(maxLen, `${nombre} no puede superar ${maxLen} caracteres`)
    .refine((v) => !HTML_CHARS_RE.test(v), `${nombre} contiene caracteres no permitidos (< > " ' \`)`)
}

// ── Schema: linea de compra ────────────────────────────────────────────────────
export const lineaCompraSchema = z.object({
  producto_id: campoUuid('El producto'),
  cantidad: campoFinanciero(999_999_999, 'La cantidad'),        // NUMERIC(12,3) → max 999,999,999.999
  costo_unitario_usd: campoFinanciero(9_999_999_999, 'El costo unitario'),  // NUMERIC(12,2) → max 9,999,999,999.99
  tipo_impuesto: z.enum(['Gravable', 'Exento', 'Exonerado']).default('Exento'),
  impuesto_pct: z.number().min(0).max(100).default(0),
})

// ── Schema: pago de compra ────────────────────────────────────────────────────
export const pagoCompraSchema = z.object({
  metodo_cobro_id: campoUuid('El método de pago'),
  moneda: z.enum(['USD', 'BS']),
  monto: campoFinanciero(9_999_999_999, 'El monto'),  // NUMERIC(12,2) → max 9,999,999,999.99
  banco_empresa_id: z
    .string()
    .refine((v) => !v || UUID_RE.test(v), 'ID de banco inválido')
    .nullable()
    .optional(),
  referencia: campoTexto(100, 'La referencia')
    .transform((v) => v.trim() || undefined)
    .optional(),
})

// ── Schema: header de factura de compra ───────────────────────────────────────
export const compraHeaderSchema = z.object({
  proveedor_id: campoUuid('El proveedor'),

  tasa: campoFinanciero(9_999_999, 'La tasa'),

  /**
   * Fecha de la factura:
   *  - formato YYYY-MM-DD
   *  - no más de 5 años en el pasado (facturas muy antiguas = error de digitación)
   *  - no más de 1 día en el futuro (advertencia visual ya existe; aquí es hard-stop)
   */
  fecha_factura: z
    .string()
    .min(1, 'La fecha es requerida')
    .regex(FECHA_RE, 'Formato de fecha inválido (YYYY-MM-DD)')
    .refine((v) => !isNaN(new Date(v).getTime()), 'Fecha inválida')
    .refine((v) => {
      const d = new Date(v + 'T00:00:00')
      const limite = new Date()
      limite.setFullYear(limite.getFullYear() - 5)
      limite.setHours(0, 0, 0, 0)
      return d >= limite
    }, 'La fecha no puede ser anterior a 5 años')
    .refine((v) => {
      const d = new Date(v + 'T00:00:00')
      const manana = new Date()
      manana.setDate(manana.getDate() + 1)
      manana.setHours(23, 59, 59, 999)
      return d <= manana
    }, 'La fecha no puede ser más de un día en el futuro'),

  /**
   * Número de factura:
   *  - requerido, máx 50 caracteres
   *  - solo letras, dígitos y guiones (coincide exactamente con lo que el input permite)
   */
  nro_factura: z
    .string()
    .min(1, 'El número de factura es requerido')
    .max(50, 'El número de factura no puede superar 50 caracteres')
    .refine(
      (v) => /^[A-Z0-9\-]+$/.test(v.trim()),
      'El número de factura solo admite letras, números y guiones'
    )
    .transform((v) => v.trim().toUpperCase()),

  /**
   * Número de control:
   *  - opcional, pero si se ingresa: máx 20 chars, formato `XX-XXXXXXX`
   *  - sin caracteres de inyección HTML/script
   */
  nro_control: z
    .string()
    .max(20, 'El número de control no puede superar 20 caracteres')
    .refine((v) => !v || !HTML_CHARS_RE.test(v), 'El número de control contiene caracteres no permitidos')
    .refine(
      (v) => !v || /^[\dA-Za-z\-]+$/.test(v.trim()),
      'El número de control solo admite dígitos, letras y guiones'
    )
    .optional()
    .transform((v) => (v?.trim() ? v.trim().toUpperCase() : undefined)),

  moneda: z.enum(['USD', 'BS']),
})

// ── Tipos inferidos ────────────────────────────────────────────────────────────
export type LineaCompraValues = z.infer<typeof lineaCompraSchema>
export type CompraHeaderValues = z.infer<typeof compraHeaderSchema>
export type PagoCompraValues = z.infer<typeof pagoCompraSchema>
