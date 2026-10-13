import Decimal from 'decimal.js'

// =============================================
// TIPOS
// =============================================

/**
 * Estados derivados de `ventas.estado` (ver migrations/0106). Reemplaza el
 * 2-valores `status` (ACTIVA/ANULADA, validez fiscal) con un estado de
 * cobranza de 4 valores, derivado exclusivamente por trigger Postgres.
 */
export type EstadoVenta = 'pendiente' | 'parcial' | 'pago' | 'reversado'

type DecimalInput = Decimal

/** Tolerancia de redondeo decimal — igual a la usada por el trigger Postgres (0.005 USD). */
const TOLERANCIA_ESTADO_VENTA = '0.005'

// =============================================
// calcularEstadoVenta
// =============================================

/**
 * Calcula `ventas.estado` espejando 1:1 los CASE de los triggers Postgres en
 * `migrations/0106`. Funcion PURA: sin I/O, sin tx.
 *
 * Mirrors BOTH trigger functions in `migrations/0106`, keep in sync:
 * - `prevent_venta_mutation()` (BEFORE UPDATE): rama completa con lookup de
 *   `ultimoMovimientoTipo` (REV/magnitud).
 * - `derive_venta_estado_insert()` (BEFORE INSERT): rama magnitud-only, que se
 *   obtiene llamando a esta funcion con `ultimoMovimientoTipo = null`.
 *
 * Reglas (ver design.md §3/§4 y specs/ventas-estado-derivado/spec.md):
 * - `ultimoMovimientoTipo === 'REV'` y `saldoPendUsd > 0.005` -> `'reversado'`
 *   (reverso reabre la deuda; distingue "nunca cobrada" de "cobrada y luego
 *   reversada"). Si saldoPendUsd cae dentro de tolerancia, NO es reversado.
 * - `saldoPendUsd <= 0.005` -> `'pago'`
 * - `saldoPendUsd >= totalUsd - 0.005` -> `'pendiente'`
 * - cualquier otro caso -> `'parcial'`
 *
 * El valor que devuelve esta funcion es SIEMPRE optimista/local — nunca se
 * sube al servidor (`ventas` esta en `TRIGGER_MANAGED_PATCH_COLUMNS`, ver
 * connector.ts); el trigger Postgres es la unica autoridad final.
 */
export function calcularEstadoVenta(
  saldoPendUsd: DecimalInput,
  totalUsd: DecimalInput,
  ultimoMovimientoTipo: string | null
): EstadoVenta {
  const tol = new Decimal(TOLERANCIA_ESTADO_VENTA)

  if (ultimoMovimientoTipo === 'REV' && saldoPendUsd.gt(tol)) {
    return 'reversado'
  }
  if (saldoPendUsd.lte(tol)) {
    return 'pago'
  }
  if (saldoPendUsd.gte(totalUsd.minus(tol))) {
    return 'pendiente'
  }
  return 'parcial'
}
