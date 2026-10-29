/**
 * `consulta-factura-reverso-abono-directo` (Unit 2): mensajes de estado
 * deshabilitado para el reverso de un abono individual, uno por cada
 * `reasonCode` que devuelve el clasificador (Unit 1,
 * `use-clasificar-abono-reverso.ts`: `REASON_BATCH_NO_DISPONIBLE`,
 * `REASON_SAF_BLOQUEADO`, `REASON_LEGACY_SIN_TRAZABILIDAD`).
 *
 * Los valores de `MENSAJES_POR_REASON_CODE` usan los MISMOS strings
 * literales que esas constantes (no se importan a proposito): este
 * archivo CERO-imports es consumido por `factura-detalle-panel.tsx`, que
 * no puede arrastrar el import real de `db.ts` del clasificador sin
 * romper su suite de tests existente (588 lineas, ninguna mockea ese
 * modulo). `consulta-factura-modal.tsx`/`confirmar-reverso-abono-modal.tsx`
 * SI importan el clasificador real (es su trabajo) y usan este mapa para
 * no duplicar el texto de los mensajes entre ambos.
 */
export const MENSAJE_BATCH_NO_DISPONIBLE = 'Reverso por lote no disponible todavía'

export const MENSAJE_SAF_BLOQUEADO =
  'Este abono generó saldo a favor consumido en otras facturas; reversar desde tesorería no está disponible todavía'

export const MENSAJE_LEGACY_SIN_TRAZABILIDAD =
  'Este abono no tiene trazabilidad; no se puede reversar desde aquí'

export const MENSAJES_POR_REASON_CODE: Record<string, string> = {
  BATCH_NO_DISPONIBLE: MENSAJE_BATCH_NO_DISPONIBLE,
  SAF_BLOQUEADO: MENSAJE_SAF_BLOQUEADO,
  LEGACY_SIN_TRAZABILIDAD: MENSAJE_LEGACY_SIN_TRAZABILIDAD,
}
