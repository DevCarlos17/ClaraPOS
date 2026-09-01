import Decimal from 'decimal.js'
import { bsToUsd, formatBs, formatUsd, usdToBs, type DecimalInput } from '@/lib/currency'

// =============================================
// TYPES
// =============================================

export interface ReciboPagoInput {
  metodo_cobro_id: string
  metodo_nombre: string
  moneda: 'USD' | 'BS'
  monto: number
}

export interface ReciboPagoLinea {
  metodoCobroId: string
  metodoNombre: string
  moneda: 'USD' | 'BS'
  montoNativo: number
  montoBs: number
  montoUsd: number
}

export type ReciboCierreTipo = 'VUELTO' | 'SAF' | 'PROPINA' | 'DIFERENCIAL_SOBRANTE' | 'CREDITO'

export interface ReciboFacturaAplicada {
  nroFactura: string
  montoUsd: number
  montoBs: number
}

export interface ReciboCierre {
  tipo: ReciboCierreTipo
  montoUsd: number
  montoBs: number
  /** Solo presente en cierres SAF con abono aplicado a factura(s) via FIFO. */
  facturasAplicadas?: ReciboFacturaAplicada[]
}

export interface ReciboInvoiceAssignment {
  nroFactura: string
  montoUsd: number
}

export interface ReciboDiscrepancyInput {
  mode: ReciboCierreTipo | 'ABSORBER' | 'DIFERENCIAL_FALTANTE' | null
  montoUsd: number
  montoBs: number
  /** Solo aplica a mode === 'SAF': facturas destino del abono, calculadas via FIFO. */
  invoiceAssignments?: ReciboInvoiceAssignment[]
}

export interface ReciboReconciliacion {
  reconciliado: boolean
  diferenciaBs: number
}

// =============================================
// CONSTANTS
// =============================================

/** Tolerancia flat de redondeo, en Bs. Los totales de entrada ya vienen en precision de vista (2 decimales). */
const RECONCILIACION_TOLERANCIA_BS = 0.01

/** Tipos de cierre que representan excedente entregado/retenido al cliente (vienen de `discrepancy`). */
const CIERRE_TIPOS_EXCEDENTE: ReadonlySet<string> = new Set(['VUELTO', 'SAF', 'PROPINA', 'DIFERENCIAL_SOBRANTE'])

// =============================================
// FUNCTIONS
// =============================================

/**
 * Agrupa pagos por `metodo_cobro_id`, sumando montos del mismo método en una sola línea.
 * Métodos USD calculan su equivalente en Bs (`monto × tasa`); métodos Bs calculan su
 * equivalente en USD (`monto / tasa`) para completar el tipo, aunque el render solo
 * muestre el equivalente relevante segun la moneda nativa del método.
 */
export function agruparPagosPorMetodo(pagos: ReciboPagoInput[], tasa: DecimalInput): ReciboPagoLinea[] {
  const acumulado = new Map<string, { metodoNombre: string; moneda: 'USD' | 'BS'; monto: Decimal }>()

  for (const pago of pagos) {
    const existente = acumulado.get(pago.metodo_cobro_id)
    const monto = existente ? existente.monto.plus(pago.monto) : new Decimal(pago.monto)
    acumulado.set(pago.metodo_cobro_id, {
      metodoNombre: pago.metodo_nombre,
      moneda: pago.moneda,
      monto,
    })
  }

  return Array.from(acumulado.entries()).map(([metodoCobroId, { metodoNombre, moneda, monto }]) => {
    const montoBs = moneda === 'USD' ? usdToBs(monto, tasa) : monto
    const montoUsd = moneda === 'USD' ? monto : bsToUsd(monto, tasa)

    return {
      metodoCobroId,
      metodoNombre,
      moneda,
      montoNativo: monto.toNumber(),
      montoBs: montoBs.toNumber(),
      montoUsd: montoUsd.toNumber(),
    }
  })
}

/**
 * Construye la línea de cierre del recibo: excedente (`discrepancy`) tiene prioridad
 * sobre saldo a crédito. Modos `ABSORBER`/`DIFERENCIAL_FALTANTE` no producen línea
 * visible (no son excedente entregado al cliente). Sin excedente ni crédito pendiente,
 * retorna `null` (recibo no muestra línea de cierre).
 */
export function construirCierreRecibo(
  discrepancy: ReciboDiscrepancyInput | null,
  saldoPendUsd: number,
  tasa: DecimalInput,
): ReciboCierre | null {
  if (discrepancy && CIERRE_TIPOS_EXCEDENTE.has(discrepancy.mode ?? '')) {
    const facturasAplicadas =
      discrepancy.mode === 'SAF' && discrepancy.invoiceAssignments?.length
        ? discrepancy.invoiceAssignments.map((asignacion) => ({
            nroFactura: asignacion.nroFactura,
            montoUsd: asignacion.montoUsd,
            montoBs: usdToBs(asignacion.montoUsd, tasa).toNumber(),
          }))
        : undefined

    return {
      tipo: discrepancy.mode as ReciboCierreTipo,
      montoUsd: discrepancy.montoUsd,
      montoBs: discrepancy.montoBs,
      ...(facturasAplicadas ? { facturasAplicadas } : {}),
    }
  }

  if (saldoPendUsd > 0) {
    return {
      tipo: 'CREDITO',
      montoUsd: saldoPendUsd,
      montoBs: usdToBs(saldoPendUsd, tasa).toNumber(),
    }
  }

  return null
}

/**
 * Formatea la lista de facturas destino de un abono SAF para la línea de cierre del
 * recibo: "{nro} por Bs X ($Y)", una entrada por factura separada por coma. Usa
 * formatBs/formatUsd, igual que el resto de las líneas del recibo, para mantener
 * consistencia visual (miles, 2 decimales fijos, "Bs." con punto).
 */
export function formatearFacturasAplicadas(facturas: ReciboFacturaAplicada[]): string {
  return facturas
    .map((f) => `${f.nroFactura} por ${formatBs(f.montoBs)} (${formatUsd(f.montoUsd)})`)
    .join(', ')
}

/**
 * Verifica que la suma de líneas de pago (en Bs) reconcilie con el total de factura
 * en Bs, dentro de una tolerancia flat de redondeo.
 */
export function reconciliarTotalBs(lineas: ReciboPagoLinea[], totalBs: number): ReciboReconciliacion {
  const sumaBs = lineas.reduce((acc, linea) => acc.plus(linea.montoBs), new Decimal(0))
  const diferencia = sumaBs.minus(totalBs)

  return {
    reconciliado: diferencia.abs().lessThanOrEqualTo(RECONCILIACION_TOLERANCIA_BS),
    diferenciaBs: diferencia.toNumber(),
  }
}

/**
 * Envuelve texto en múltiples líneas segun el ancho disponible (greedy word-wrap),
 * usando `ctx.measureText` para medir el ancho real de cada línea candidata.
 * Palabras individuales que exceden `maxWidthPx` se dejan en su propia línea
 * (no se parten por caracter) para no fragmentar palabras.
 */
export function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidthPx: number): string[] {
  const normalizado = text.trim()
  if (normalizado === '') return []

  const palabras = normalizado.split(/\s+/)
  const lineas: string[] = []
  let lineaActual = ''

  for (const palabra of palabras) {
    const candidata = lineaActual === '' ? palabra : `${lineaActual} ${palabra}`
    if (lineaActual === '' || ctx.measureText(candidata).width <= maxWidthPx) {
      lineaActual = candidata
    } else {
      lineas.push(lineaActual)
      lineaActual = palabra
    }
  }

  if (lineaActual !== '') lineas.push(lineaActual)

  return lineas
}
