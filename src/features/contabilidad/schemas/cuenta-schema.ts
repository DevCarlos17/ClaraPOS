import { z } from 'zod'

export const cuentaSchema = z.object({
  // Codigo alfanumerico con puntos, ej: "6.1.01" o "4.2.1.03"
  codigo: z
    .string()
    .min(1, 'El codigo es requerido')
    .regex(
      /^[A-Za-z0-9]+(\.[A-Za-z0-9]+)*$/,
      'Formato invalido. Ej: 6.1.01 (alfanumerico separado por puntos)'
    ),
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  tipo: z.enum(['GASTO', 'INGRESO_OTRO'], {
    message: 'Selecciona el tipo: Gasto o Ingreso Otro',
  }),
  parent_id: z.string().optional(),
  nivel: z
    .number({ message: 'El nivel es requerido' })
    .int('Debe ser un numero entero')
    .min(1, 'El nivel minimo es 1'),
  es_cuenta_detalle: z.boolean().default(false),
})

export type CuentaFormValues = z.infer<typeof cuentaSchema>
