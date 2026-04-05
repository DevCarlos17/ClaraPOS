import { z } from 'zod'

export const createEmployeeSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Correo electronico invalido'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
  level: z.union([z.literal(2), z.literal(3)], {
    error: 'Selecciona un nivel valido',
  }),
})

export type CreateEmployeeValues = z.infer<typeof createEmployeeSchema>

export const updateEmployeeSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').optional(),
  level: z
    .union([z.literal(2), z.literal(3)], {
      error: 'Selecciona un nivel valido',
    })
    .optional(),
})

export type UpdateEmployeeValues = z.infer<typeof updateEmployeeSchema>
