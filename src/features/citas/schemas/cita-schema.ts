import { z } from 'zod'

export const citaSchema = z.object({
  clienteId: z.string().min(1, 'Selecciona un cliente'),
  servicios: z
    .array(
      z.object({
        productoId: z.string(),
        nombre: z.string(),
        precioUsd: z.number().min(0),
        duracionMin: z.number().min(1),
      })
    )
    .min(1, 'Agrega al menos un servicio'),
  ejecucionParalela: z.boolean(),
  prioridadFiltro: z.enum(['EMPLEADO', 'HORA']),
  profesionalFavoritoId: z.string().optional(),
  fecha: z.string().min(1, 'Selecciona una fecha'),
  horaInicio: z.string().min(1, 'Selecciona hora de inicio'),
  horaFin: z.string().min(1, 'Selecciona hora de fin'),
  checkoutTipo: z.enum(['RESERVA', 'POS', 'CREDITO']),
  observaciones: z.string().optional(),
})

export const horarioStaffSchema = z.object({
  diaSemana: z.number().min(0).max(6),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  isActive: z.boolean(),
})

export type CitaFormData = z.infer<typeof citaSchema>
export type HorarioStaffFormData = z.infer<typeof horarioStaffSchema>
