import { z } from 'zod'

export const movimientoManualSchema = z.object({
  metodo_cobro_id: z.string().min(1, 'Seleccione un metodo de cobro'),
  tipo: z.enum(['INGRESO', 'EGRESO']),
  origen: z.enum(['INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO']),
  monto: z
    .number({ message: 'Ingrese un monto valido' })
    .positive('El monto debe ser mayor a 0')
    .max(999999.99, 'El monto es demasiado elevado'),
  concepto: z.string().min(3, 'El concepto debe tener al menos 3 caracteres').max(200),
})

export type MovimientoManualValues = z.infer<typeof movimientoManualSchema>

// Tipo de operacion para la UI (determina tipo + origen)
export type OrigenManual = 'INGRESO_MANUAL' | 'EGRESO_MANUAL' | 'AVANCE' | 'PRESTAMO'

export const ORIGEN_LABELS: Record<OrigenManual, string> = {
  INGRESO_MANUAL: 'Ingreso Manual',
  EGRESO_MANUAL: 'Egreso Manual',
  AVANCE: 'Avance de Efectivo',
  PRESTAMO: 'Prestamo',
}

/** El tipo (INGRESO/EGRESO) que corresponde a cada origen */
export function tipoDeOrigen(origen: OrigenManual): 'INGRESO' | 'EGRESO' {
  if (origen === 'EGRESO_MANUAL') return 'EGRESO'
  return 'INGRESO'
}
