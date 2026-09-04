import Decimal from 'decimal.js'
import type { DecimalInput } from '@/lib/currency'

/**
 * Modulo PURO (sin I/O) compartido POS/Tradicional para el rediseno UI de
 * Notas de Credito (openspec/changes/notas-credito-ui-pos/design.md).
 */

// =============================================
// derivarEstadoPago — Design §Decision 4
// =============================================

export type EstadoPago = 'CONTADO' | 'CREDITO' | 'ABONADA'

/**
 * `ventas.saldo_pend_usd` ya es el campo persistido/mantenido por
 * `aplicarPagoFacturaEnTx`/`crearNotaCredito` — NUNCA se suma
 * `pagos.monto_usd` de forma independiente (evitaria doble fuente de
 * verdad y divergiria si algun pago esta reversado). Epsilon `0.005`,
 * consistente con el umbral ya usado en `vencimientos_cobrar`.
 */
export function derivarEstadoPago(f: { total_usd: DecimalInput; saldo_pend_usd: DecimalInput }): EstadoPago {
  const total = new Decimal(f.total_usd)
  const saldo = new Decimal(f.saldo_pend_usd)
  if (saldo.lte('0.005')) return 'CONTADO'
  if (saldo.gte(total.minus('0.005'))) return 'CREDITO'
  return 'ABONADA'
}

// =============================================
// huboAfectacionCxc — Design §Decision 6
// =============================================

/**
 * Fuente correcta y persistida de "afectacion a CxC": COUNT(*) de
 * `movimientos_cuenta WHERE venta_id = ?`. NUNCA `construirCierreRecibo`/
 * `discrepancy` de `recibo-pagos.ts` — ese estado es efimero de React
 * (calculado en el momento del cobro, nunca persistido) e irrecuperable
 * para facturas historicas del listado de sesion.
 */
export function huboAfectacionCxc(cantidadMovimientosCuenta: number): boolean {
  return cantidadMovimientosCuenta > 0
}

// =============================================
// facturaCoincideBusqueda — Slice 2 (buscador de la lista)
// =============================================

export const ESTADO_PAGO_LABEL: Record<EstadoPago, string> = {
  CONTADO: 'Contado',
  CREDITO: 'Crédito',
  ABONADA: 'Abonada',
}

export interface FacturaBuscable {
  nro_factura: string
  cliente_nombre: string
  total_usd: DecimalInput
  saldo_pend_usd: DecimalInput
  tiene_reverso_total?: number
  tiene_reverso_parcial?: number
}

/** Normaliza acentos para busqueda tolerante (ej. "credito" matchea "Crédito"). */
function normalizarBusqueda(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Filtro client-side de la lista de facturas de sesion (Spec
 * notas-credito-pos: "buscador por numero, cliente o estado"). Coincide por
 * substring case/acento-insensitive contra `nro_factura`, `cliente_nombre`,
 * el label de `derivarEstadoPago` y los labels de reverso (si aplican).
 * Query vacio siempre coincide (sin filtro).
 */
export function facturaCoincideBusqueda(f: FacturaBuscable, query: string): boolean {
  const q = normalizarBusqueda(query.trim())
  if (!q) return true
  const haystack = [
    f.nro_factura,
    f.cliente_nombre,
    ESTADO_PAGO_LABEL[derivarEstadoPago(f)],
    f.tiene_reverso_total === 1 ? 'Reverso Total' : '',
    f.tiene_reverso_parcial === 1 ? 'Reverso Parcial' : '',
  ]
  return haystack.some((campo) => normalizarBusqueda(campo).includes(q))
}
