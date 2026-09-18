import Decimal from 'decimal.js'
import { usdToBs } from '@/lib/currency'
import {
  buildReciboData,
  type MonedaPresentacion,
  type ReciboData,
  type TipoImpuestoLinea,
  type ReciboEvolucionInput,
  type ReciboEvolucionMovimientoInput,
  type ReciboEvolucionReversoMetodoInput,
} from './factura-export'
import {
  useDetalleFactura,
  usePagosFactura,
  useEvolucionFactura,
  type DetalleFacturaCxc,
  type PagoFacturaCxc,
  type EvolucionFacturaRow,
} from '@/features/cxc/hooks/use-cxc'
import { useCompany, parseEmpresaConfig, type Company } from '@/features/configuracion/hooks/use-company'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { agruparReversosPorNc } from './notas-credito-ui'
import { nativoAUsd } from './notas-credito-refund'
import {
  useReversosFactura,
  useReembolsosTesoreriaFactura,
  type FacturaParaAnular,
  type ReembolsoTesoreriaFacturaRow,
} from '../hooks/use-notas-credito'

/**
 * Mismo mapeo que `venta-exitosa-modal.tsx`/`nota-credito-pos-modal.tsx`/
 * `crear-ncr-modal.tsx` (Design §Decision 5) — no una formula nueva.
 */
function toTipoImpuestoLinea(val: string): TipoImpuestoLinea {
  return val === 'Gravable' || val === 'Exonerado' ? val : 'Exento'
}

/**
 * Reduce el arreglo `saldoAFavor` (0..N filas SAFC de `useEvolucionFactura`)
 * a un unico `ReciboEvolucionMovimientoInput` (Design §Interfaces —
 * `ReciboEvolucionInput.saldoAFavorGenerado` es singular). Sin filas ->
 * `null`. Con una sola fila, passthrough directo. Con 2+ (un mismo `venta_id`
 * generando SAF en mas de una NC/anticipo), se suma el monto USD y se usa la
 * `tasa_pago` de la fila MAS RECIENTE para la conversion a Bs del total — no
 * hay una "tasa correcta" unica cuando cada fila tiene su propia tasa
 * historica, y mostrar un solo monto agregado es preferible a listar cada
 * SAFC por separado (fuera del alcance de este slice).
 *
 * `tasaHistorica` (= `venta.tasa`, tasa de la factura al momento de su
 * emision) es el FALLBACK cuando `tasa_pago` de la fila es `null`. Las filas
 * NCR/SAFC escritas por `crearNotaCredito` antes de este fix nunca
 * persistieron `tasa_pago` (bug diagnosticado en
 * `sdd/nc-refund-tesoreria/bug-evolucion-bs`) y `movimientos_cuenta` es
 * inmutable (regla #2 CLAUDE.md) — sin este fallback, esas filas historicas
 * seguirian mostrando Bs. 0,00 para siempre.
 */
function reducirSaldoAFavorGenerado(
  rows: EvolucionFacturaRow[],
  tasaHistorica: string
): ReciboEvolucionMovimientoInput | null {
  if (rows.length === 0) return null
  if (rows.length === 1) {
    return { fecha: rows[0].fecha, monto: rows[0].monto, tasaPago: rows[0].tasa_pago ?? tasaHistorica }
  }
  const montoTotal = rows.reduce((acc, r) => acc.plus(r.monto), new Decimal(0))
  const masReciente = rows[rows.length - 1]
  return {
    fecha: masReciente.fecha,
    monto: montoTotal.toString(),
    tasaPago: masReciente.tasa_pago ?? tasaHistorica,
  }
}

/**
 * Enhancement B (nc-refund-tesoreria): convierte una fila cruda de
 * `useReembolsosTesoreriaFactura` (monto NATIVO de la cuenta + su moneda) a
 * `ReciboEvolucionReversoMetodoInput` (USD+Bs ya calculados), usando
 * SIEMPRE `venta.tasa` (tasa historica de la factura) — nunca la tasa
 * vigente del sistema, mismo criterio que el resto de este archivo. Reusa
 * `nativoAUsd` (misma funcion pura que `RefundTesoreriaForm`/el motor de
 * `crearNotaCredito` usan para el calculo en vivo/la revalidacion server-
 * side) para no introducir una tercera formula de conversion.
 */
function mapReembolsoMetodo(
  row: ReembolsoTesoreriaFacturaRow,
  tasaHistorica: string
): ReciboEvolucionReversoMetodoInput {
  const esCuentaBs = row.monedaCodigo === 'VES'
  const montoUsd = nativoAUsd(row.montoNativo, esCuentaBs, tasaHistorica)
  const montoBs = esCuentaBs ? new Decimal(row.montoNativo) : usdToBs(montoUsd, tasaHistorica)
  return {
    cuentaNombre: row.cuentaNombre,
    montoUsd: montoUsd.toString(),
    montoBs: montoBs.toString(),
    referencia: row.referencia,
  }
}

/** Mismo fallback de `tasaHistorica` que `reducirSaldoAFavorGenerado` — ver su doc. */
function mapEvolucionMovimiento(
  row: EvolucionFacturaRow,
  tasaHistorica: string
): ReciboEvolucionMovimientoInput {
  return { fecha: row.fecha, monto: row.monto, tasaPago: row.tasa_pago ?? tasaHistorica }
}

/**
 * Extraccion de la fila de mapeo saved-invoice -> `ReciboData`, duplicada
 * byte-a-byte en `nota-credito-pos-modal.tsx` y `crear-ncr-modal.tsx` antes de
 * este change (Design §Decision 1/2). Pura, sin efectos: mismo `ReciboData`
 * que los `useMemo` inline producian cuando `opts` se omite.
 */
export function buildReciboDataDesdeFacturaGuardada(
  factura: FacturaParaAnular,
  detalle: DetalleFacturaCxc[],
  pagos: PagoFacturaCxc[],
  company: Company | null,
  opts?: { esReimpresion?: boolean; monedaPresentacion?: MonedaPresentacion },
  evolucion?: ReciboEvolucionInput
): ReciboData {
  return buildReciboData({
    nroFactura: factura.nro_factura,
    fecha: factura.fecha,
    emisor: { nombre: company?.nombre ?? '', rif: company?.rif ?? null, direccion: company?.direccion ?? null },
    cliente: { nombre: factura.cliente_nombre, identificacion: factura.cliente_identificacion, direccion: null },
    lineas: detalle.map((d) => ({
      codigo: d.producto_codigo,
      nombre: d.producto_nombre,
      cantidad: d.cantidad,
      precioUnitarioUsd: d.precio_unitario_usd,
      tipoImpuesto: toTipoImpuestoLinea(d.tipo_impuesto),
      impuestoPct: d.impuesto_pct,
    })),
    // SIEMPRE la tasa historica de la factura — nunca la tasa vigente del sistema.
    tasa: factura.tasa,
    igtfUsd: factura.total_igtf_usd && Number(factura.total_igtf_usd) > 0 ? Number(factura.total_igtf_usd) : null,
    pagos: pagos.map((p) => ({
      metodo_cobro_id: p.metodo_cobro_id,
      metodo_nombre: p.metodo_nombre,
      moneda: p.moneda_label as 'USD' | 'BS',
      monto: Number(p.monto),
    })),
    discrepancy: null,
    saldoPendUsd: Number(factura.saldo_pend_usd),
    esReimpresion: opts?.esReimpresion,
    monedaPresentacion: opts?.monedaPresentacion,
    evolucion,
  })
}

/**
 * Compone `useDetalleFactura`/`usePagosFactura`/`useCompany` +
 * `buildReciboDataDesdeFacturaGuardada` para consumidores que arrancan solo
 * con un `FacturaParaAnular` (Design §Decision 1) — a diferencia de los dos
 * modales NC (FROZEN), que ya poseen estos 3 hooks con sus propias
 * variables/deps y NUNCA se migran a este hook.
 */
export function useReciboDesdeFactura(
  venta: FacturaParaAnular | null,
  opts?: { esReimpresion?: boolean; derivarMonedaPresentacion?: boolean }
): { recibo: ReciboData | null; isLoading: boolean } {
  const ventaId = venta?.id ?? null
  const { detalle, isLoading: loadingDetalle } = useDetalleFactura(ventaId)
  const { pagos, isLoading: loadingPagos } = usePagosFactura(ventaId)
  const { company, isLoading: loadingCompany } = useCompany()
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { reversos, isLoading: loadingReversos } = useReversosFactura(ventaId, empresaId)
  const {
    abonos,
    reversosPago,
    saldoAFavor,
    isLoading: loadingEvolucion,
  } = useEvolucionFactura(ventaId, empresaId)
  const { reembolsos, isLoading: loadingReembolsos } = useReembolsosTesoreriaFactura(ventaId, empresaId)

  if (!venta) {
    return { recibo: null, isLoading: false }
  }

  if (loadingDetalle || loadingPagos || loadingCompany || loadingReversos || loadingEvolucion || loadingReembolsos) {
    return { recibo: null, isLoading: true }
  }

  const monedaPresentacion = opts?.derivarMonedaPresentacion
    ? parseEmpresaConfig(company?.config).moneda_presentacion_documentos
    : undefined

  const evolucion: ReciboEvolucionInput = {
    reversos: agruparReversosPorNc(reversos).map((r) => ({
      nroNcr: r.nroNcr,
      tipo: r.tipo,
      fecha: r.fecha,
      totalUsd: r.montoUsd,
      totalBs: r.montoBs,
      // Enhancement B (nc-refund-tesoreria): metodos de tesoreria usados
      // para reembolsar ESTA NC especifica (cruzado por notaCreditoId).
      metodosReembolso: reembolsos
        .filter((e) => e.notaCreditoId === r.notaCreditoId)
        .map((e) => mapReembolsoMetodo(e, venta.tasa)),
    })),
    // SIEMPRE la tasa historica de la factura (venta.tasa) como fallback —
    // nunca la tasa vigente del sistema (mismo criterio que `tasa` en
    // buildReciboDataDesdeFacturaGuardada`, linea ~84 arriba).
    abonos: abonos.map((r) => mapEvolucionMovimiento(r, venta.tasa)),
    reversosPago: reversosPago.map((r) => mapEvolucionMovimiento(r, venta.tasa)),
    saldoAFavorGenerado: reducirSaldoAFavorGenerado(saldoAFavor, venta.tasa),
  }

  const recibo = buildReciboDataDesdeFacturaGuardada(
    venta,
    detalle,
    pagos,
    company,
    {
      esReimpresion: opts?.esReimpresion,
      monedaPresentacion,
    },
    evolucion
  )

  return { recibo, isLoading: false }
}
