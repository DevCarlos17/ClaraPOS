import { z } from 'zod'

// ─── Apertura de sesion ──────────────────────────────────────

export const sesionCajaAperturaSchema = z.object({
  caja_id: z.string().min(1, 'La caja es requerida'),
  monto_apertura_usd: z
    .number({ message: 'El monto de apertura es requerido' })
    .min(0, 'El monto no puede ser negativo'),
  monto_apertura_bs: z
    .number()
    .min(0, 'El monto no puede ser negativo')
    .optional()
    .default(0),
})

export type SesionCajaAperturaValues = z.infer<typeof sesionCajaAperturaSchema>

// ─── Cierre de sesion ────────────────────────────────────────

export const sesionCajaCierreSchema = z.object({
  monto_fisico_usd: z
    .number({ message: 'El monto fisico es requerido' })
    .min(0, 'El monto no puede ser negativo'),
  observaciones_cierre: z.string().optional(),
})

export type SesionCajaCierreValues = z.infer<typeof sesionCajaCierreSchema>
