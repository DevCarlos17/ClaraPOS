import Decimal from 'decimal.js'
import type { DecimalInput } from '@/lib/currency'
import { buildReciboData, type ReciboLineaInput } from './factura-export'
import type { LineaNcSeleccionada } from '../hooks/use-notas-credito'

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

// =============================================
// previewMontoBsNc — Design §Decision 8 (INVARIANTE BIMONETARIA)
// =============================================

/**
 * Preview del monto de NC en USD/Bs. GUARDRAIL mas importante del change:
 * el monto en Bs NUNCA se deriva de la tasa vigente del sistema — SIEMPRE
 * de `factura.tasa` (tasa historica ya persistida en `ventas`).
 *
 * TOTAL: `factura.total_bs` verbatim, sin ningun calculo (la NC TOTAL replica
 * exactamente el total de la factura original).
 *
 * PARCIAL: reusa `buildReciboData` sobre el subconjunto de lineas
 * seleccionadas con `tasa: factura.tasa` — estructuralmente igual a
 * `calcularDesgloseLineaNC` del backend (misma `applyImpuesto` de
 * `lib/currency.ts`), imposible de divergir del monto que `crearNotaCredito`
 * calculara al confirmar. CERO formula paralela nueva.
 */
export function previewMontoBsNc(input: {
  tipo: 'TOTAL' | 'PARCIAL'
  factura: { total_usd: number; total_bs: number; tasa: number }
  lineasSeleccionadas?: ReciboLineaInput[]
}): { totalUsd: number; totalBs: number } {
  if (input.tipo === 'TOTAL') {
    return { totalUsd: input.factura.total_usd, totalBs: input.factura.total_bs }
  }

  const preview = buildReciboData({
    nroFactura: '',
    fecha: '',
    emisor: { nombre: '', rif: null, direccion: null },
    cliente: { nombre: '', identificacion: '', direccion: null },
    lineas: input.lineasSeleccionadas ?? [],
    // SIEMPRE la tasa historica de la factura — nunca la tasa vigente del sistema.
    tasa: input.factura.tasa,
    igtfUsd: null,
    pagos: [],
    discrepancy: null,
    saldoPendUsd: 0,
  })

  return { totalUsd: preview.totales.totalFacturaUsd, totalBs: preview.totales.totalFacturaBs }
}

// =============================================
// derivarLineasNcParcial — Design §Decision 7
// =============================================

export interface LineaFacturaParaNc {
  venta_det_id: string
  cantidadFacturada: number
  esDecimal: boolean
}

export interface DerivarLineasNcResult {
  lineas: LineaNcSeleccionada[]
  errores: string[]
}

/**
 * Mapea las cantidades ingresadas en la UI de seleccion PARCIAL al contrato
 * exacto de `crearNotaCredito` (`LineaNcSeleccionada[]`). El tope acumulado
 * cross-NC (`validarTopeDobleCredito`) sigue siendo responsabilidad exclusiva
 * del backend — esta funcion solo valida contra la cantidad facturada de
 * ESTA factura y el `es_decimal` de la unidad.
 */
export function derivarLineasNcParcial(
  facturaLineas: LineaFacturaParaNc[],
  cantidadesUi: Record<string, number>
): DerivarLineasNcResult {
  const lineas: LineaNcSeleccionada[] = []
  const errores: string[] = []

  for (const linea of facturaLineas) {
    const cantidad = cantidadesUi[linea.venta_det_id] ?? 0
    if (cantidad <= 0) continue

    if (cantidad > linea.cantidadFacturada) {
      errores.push(
        `La cantidad a devolver de la linea ${linea.venta_det_id} excede lo facturado (${linea.cantidadFacturada}).`
      )
      continue
    }
    if (!linea.esDecimal && !Number.isInteger(cantidad)) {
      errores.push(`La linea ${linea.venta_det_id} no admite cantidades decimales.`)
      continue
    }

    lineas.push({
      venta_det_id: linea.venta_det_id,
      cantidadDevolver: new Decimal(cantidad).toFixed(3),
    })
  }

  if (lineas.length === 0) {
    errores.push('Selecciona al menos una linea con cantidad mayor a 0.')
  }

  return { lineas, errores }
}
