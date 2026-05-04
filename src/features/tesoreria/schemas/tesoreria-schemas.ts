import { z } from 'zod'

export const cajaFuerteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100),
  moneda_id: z.string().uuid('Seleccione una moneda'),
  saldo_inicial: z.coerce.number().min(0, 'El saldo inicial no puede ser negativo').optional(),
  descripcion: z.string().max(300).optional(),
})

export type CajaFuerteFormValues = z.infer<typeof cajaFuerteSchema>

export const movManualSchema = z.object({
  tipo: z.enum(['INGRESO', 'EGRESO']),
  monto: z.coerce.number().positive('El monto debe ser mayor a cero'),
  descripcion: z.string().min(1, 'Ingrese una descripcion o motivo').max(300),
  gasto_id: z.string().uuid().optional().nullable(),
  fecha: z.string().min(10, 'Seleccione una fecha'),
})

export type MovManualFormValues = z.infer<typeof movManualSchema>

export const traspasoSchema = z
  .object({
    cuenta_origen_id: z.string().min(1, 'Seleccione la cuenta origen'),
    cuenta_destino_id: z.string().min(1, 'Seleccione la cuenta destino'),
    monto_origen: z.coerce.number().positive('El monto debe ser mayor a cero'),
    tasa_cambio: z.coerce.number().positive().optional().nullable(),
    fecha: z.string().min(10, 'Seleccione una fecha'),
    observacion: z.string().max(300).optional(),
  })
  .refine((d) => d.cuenta_origen_id !== d.cuenta_destino_id, {
    message: 'La cuenta origen y destino no pueden ser la misma',
    path: ['cuenta_destino_id'],
  })

export type TraspasoFormValues = z.infer<typeof traspasoSchema>

export const reversoSchema = z.object({
  motivo: z
    .string()
    .min(3, 'Ingrese al menos 3 caracteres')
    .max(300, 'El motivo no puede superar 300 caracteres'),
})

export type ReversoFormValues = z.infer<typeof reversoSchema>
