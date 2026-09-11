import { buildReciboData, type MonedaPresentacion, type ReciboData, type TipoImpuestoLinea } from './factura-export'
import {
  useDetalleFactura,
  usePagosFactura,
  type DetalleFacturaCxc,
  type PagoFacturaCxc,
} from '@/features/cxc/hooks/use-cxc'
import { useCompany, parseEmpresaConfig, type Company } from '@/features/configuracion/hooks/use-company'
import type { FacturaParaAnular } from '../hooks/use-notas-credito'

/**
 * Mismo mapeo que `venta-exitosa-modal.tsx`/`nota-credito-pos-modal.tsx`/
 * `crear-ncr-modal.tsx` (Design §Decision 5) — no una formula nueva.
 */
function toTipoImpuestoLinea(val: string): TipoImpuestoLinea {
  return val === 'Gravable' || val === 'Exonerado' ? val : 'Exento'
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
  opts?: { esReimpresion?: boolean; monedaPresentacion?: MonedaPresentacion }
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

  if (!venta) {
    return { recibo: null, isLoading: false }
  }

  if (loadingDetalle || loadingPagos || loadingCompany) {
    return { recibo: null, isLoading: true }
  }

  const monedaPresentacion = opts?.derivarMonedaPresentacion
    ? parseEmpresaConfig(company?.config).moneda_presentacion_documentos
    : undefined

  const recibo = buildReciboDataDesdeFacturaGuardada(venta, detalle, pagos, company, {
    esReimpresion: opts?.esReimpresion,
    monedaPresentacion,
  })

  return { recibo, isLoading: false }
}
