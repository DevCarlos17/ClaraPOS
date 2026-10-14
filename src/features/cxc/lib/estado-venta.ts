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

/**
 * Tolerancia de redondeo decimal — igual a la usada por el trigger Postgres
 * (`migrations/0108`, que corrige `migrations/0106`).
 *
 * VALOR INTERINO (0, exacto), NO la respuesta final de produccion. Decision
 * del owner (ver openspec/changes/cxc-sync-snapshot-redesign): ClaraPOS es
 * USD-anchored pero la cobranza ocurre en Bs con tasa de cambio VARIABLE —
 * una tolerancia USD de 0.005 podia dejar Bs reales sin cobrar (ej: $0.005 a
 * tasa 500 = Bs 2.5 nunca reclamados). Por eso una factura ahora es 'pago'
 * SOLO cuando `saldo_pend_usd` es EXACTAMENTE 0 — sin margen de redondeo.
 *
 * Los residuos de redondeo que puedan quedar en cascadas de pago complejas
 * (columnas `NUMERIC(20,8)`, ver CLAUDE.md regla #10) estan pendientes de un
 * cambio FUTURO y SEPARADO que los enrute por el flujo EXISTENTE de
 * diferencial-cambiario-a-gasto. NO asumir que 0 es la respuesta final ni
 * "segura" contra polvo de redondeo en produccion — es un valor de
 * verificacion en un ambiente de PRUEBA donde el owner puede pagar facturas
 * de forma completa para validar la transicion de `estado` limpiamente.
 */
const TOLERANCIA_ESTADO_VENTA = '0'

// =============================================
// calcularEstadoVenta
// =============================================

/**
 * Calcula `ventas.estado` espejando 1:1 los CASE de los triggers Postgres en
 * `migrations/0108` (corrige `migrations/0106`, misma estructura). Funcion
 * PURA: sin I/O, sin tx.
 *
 * Mirrors BOTH trigger functions in `migrations/0108`, keep in sync:
 * - `prevent_venta_mutation()` (BEFORE UPDATE): rama completa con lookup de
 *   `ultimoMovimientoTipo` (REV/magnitud).
 * - `derive_venta_estado_insert()` (BEFORE INSERT): rama magnitud-only, que se
 *   obtiene llamando a esta funcion con `ultimoMovimientoTipo = null`.
 *
 * Reglas (ver design.md §3/§4 y specs/ventas-estado-derivado/spec.md,
 * tolerancia 0 segun migrations/0108):
 * - `ultimoMovimientoTipo === 'REV'` y `saldoPendUsd > 0` -> `'reversado'`
 *   (reverso reabre la deuda; distingue "nunca cobrada" de "cobrada y luego
 *   reversada"). Solo si saldoPendUsd es EXACTAMENTE 0, NO es reversado.
 * - `saldoPendUsd <= 0` -> `'pago'`
 * - `saldoPendUsd >= totalUsd` -> `'pendiente'`
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
