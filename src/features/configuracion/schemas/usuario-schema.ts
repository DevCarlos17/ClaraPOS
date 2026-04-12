import { z } from 'zod'

export const createEmployeeSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Correo electronico invalido'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres'),
  rol_id: z.string().min(1, 'Selecciona un rol'),
})

export type CreateEmployeeValues = z.infer<typeof createEmployeeSchema>

export const updateEmployeeSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').optional(),
  rol_id: z.string().min(1, 'Selecciona un rol').optional(),
})

export type UpdateEmployeeValues = z.infer<typeof updateEmployeeSchema>
