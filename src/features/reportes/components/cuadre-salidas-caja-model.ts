// Funciones puras para la tabla auditoria "Salidas de Caja" (bajo "Movimientos
// Manuales de Caja" en el cuadre de caja).
//
// Bug fijado (engram sdd/nc-cuadre/apply-progress): los egresos de efectivo por
// devolucion de Nota de Credito (origen='NCR') ya se sumaban al total de
// "Devoluciones (NC)" en la Card 5 "Arqueo Teorico" (ver `cuadre-arqueo-teorico-model.ts`,
// `ORIGENES_DEVOLUCION_NC`), pero quedaban EXCLUIDOS de esta tabla auditoria —
// inconsistencia "Regla de Oro invisible": la plata se contaba en el arqueo pero
// no era visible/auditable como fila. Se agregan aditivamente los mismos origenes
// de `ORIGENES_DEVOLUCION_NC` a la lista preexistente (EGRESO_MANUAL,
// EGRESO_TESORERIA, PAGO_PROVEEDOR), reutilizando la clasificacion ya establecida
// para que una futura NC-admin (Fase 2) tambien caiga aca sin tocar este archivo
// de nuevo. Ningun total (arqueo/conteo) cambia — esto es PURA presentacion.
import { ORIGENES_DEVOLUCION_NC } from './cuadre-arqueo-teorico-model'

export const ORIGENES_SALIDA_CAJA = [
  'EGRESO_MANUAL',
  'EGRESO_TESORERIA',
  'PAGO_PROVEEDOR',
  ...ORIGENES_DEVOLUCION_NC,
] as const

export interface SalidaCajaItem {
  origen: string
}

export function esSalidaCaja(item: SalidaCajaItem): boolean {
  return (ORIGENES_SALIDA_CAJA as readonly string[]).includes(item.origen)
}

export interface ConceptoSalidaInput {
  origen: string
  concepto: string | null
  destinatario: string | null
  metodo_nombre: string
  nro_ncr: string | null
}

// Resuelve el label de la columna "Concepto". Para devoluciones de NC (origen en
// ORIGENES_DEVOLUCION_NC) fuerza el formato "Devolución NC-{nro_ncr}", usando el
// numero resuelto via join a `notas_credito.nro_ncr` (ver `useMovimientosEfectivoCaja`
// en `use-cuadre.ts`) — NO se usa el `concepto` crudo del movimiento porque ese
// texto ya tiene un typo de origen ("Devolucion NCR NCR-000001 - Venta ...", doble
// prefijo NCR) escrito por `use-notas-credito.ts` (fuera de scope: es write logic).
// Si el join no resuelve (dato legacy/huerfano sin match en notas_credito), cae al
// generico "Devolución NC" en vez de mostrar ese texto con el typo.
export function resolverConceptoSalida(item: ConceptoSalidaInput): string {
  const esDevolucionNc = (ORIGENES_DEVOLUCION_NC as readonly string[]).includes(item.origen)
  if (esDevolucionNc) {
    return item.nro_ncr ? `Devolución NC-${item.nro_ncr}` : 'Devolución NC'
  }
  return item.concepto ?? item.destinatario ?? item.metodo_nombre
}
