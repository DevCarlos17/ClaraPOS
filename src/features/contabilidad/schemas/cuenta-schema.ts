import { z } from 'zod'

export const TIPOS_CUENTA = ['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'COSTO', 'GASTO'] as const
export type TipoCuenta = (typeof TIPOS_CUENTA)[number]

export const NATURALEZAS_CUENTA = ['DEUDORA', 'ACREEDORA'] as const
export type NaturalezaCuenta = (typeof NATURALEZAS_CUENTA)[number]

// Mapa naturaleza por defecto segun tipo
export const NATURALEZA_POR_TIPO: Record<TipoCuenta, NaturalezaCuenta> = {
  ACTIVO: 'DEUDORA',
  COSTO: 'DEUDORA',
  GASTO: 'DEUDORA',
  PASIVO: 'ACREEDORA',
  PATRIMONIO: 'ACREEDORA',
  INGRESO: 'ACREEDORA',
}

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
  tipo: z.enum(TIPOS_CUENTA, {
    message: 'Selecciona el tipo de cuenta',
  }),
  naturaleza: z.enum(NATURALEZAS_CUENTA, {
    message: 'Selecciona la naturaleza: Deudora o Acreedora',
  }),
  parent_id: z.string().optional(),
  nivel: z
    .number({ message: 'El nivel es requerido' })
    .int('Debe ser un numero entero')
    .min(1, 'El nivel minimo es 1'),
  es_cuenta_detalle: z.boolean().default(false),
})

export type CuentaFormValues = z.infer<typeof cuentaSchema>
