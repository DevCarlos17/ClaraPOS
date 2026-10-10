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
import type { ReciboPagoInput } from './recibo-pagos'
import {
  useDetalleFactura,
  usePagosFactura,
  useEvolucionFactura,
  useSafAplicacionesFactura,
  type DetalleFacturaCxc,
  type PagoFacturaCxc,
  type EvolucionFacturaRow,
  type SafAplicacionFacturaCxc,
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

/**
 * Reduce el arreglo `safAplicaciones` (0..N filas `saf_creditos_aplicaciones`
 * de `useSafAplicacionesFactura`, PR8 saf-display-factura) a un unico
 * `ReciboEvolucionMovimientoInput` (mismo criterio que
 * `reducirSaldoAFavorGenerado` — ver su doc arriba, aqui aplicado al SAF
 * CONSUMIDO/aplicado a esta factura en vez del SAF que esta factura generó).
 * Sin filas -> `null`. Con 2+ (p.ej. un abono-global que cruza varios lotes
 * de SAF hacia la MISMA factura), se suma el monto USD y se usa la
 * `tasa_pago` de la fila MAS RECIENTE — la query de `useSafAplicacionesFactura`
 * ya ordena ASC por `fecha, created_at`, asi que la ultima fila del arreglo
 * es la mas reciente.
 */
function reducirSaldoAFavorAplicado(
  rows: SafAplicacionFacturaCxc[],
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

const SAF_EMISION_METODO_ID = '__SAF_EMISION__'
const SAF_EMISION_METODO_NOMBRE = 'Saldo a favor'

/**
 * Particiona `safAplicaciones` (0..N filas `saf_creditos_aplicaciones`) segun
 * el momento en que el SAF pago ESTA factura, por regla de negocio del owner
 * (sdd/saf-snapshot-y-trazabilidad, PR9 — ver engram discovery #5222):
 *
 * - EMISION: `sca.fecha === venta.fecha` (igualdad EXACTA de string ISO) — el
 *   SAF pago la factura en el MISMO `writeTransaction`/`now` en que esa
 *   factura se creo en POS (`use-ventas.ts` crearVenta → consumirSafLotesEnTx
 *   con `fecha: now`, el MISMO `now` usado para el INSERT de `ventas`).
 * - POST-EMISION: cualquier otra fecha (en la practica siempre `>` — CxC
 *   `registrarPagoFactura`/`registrarAbonoGlobal` paga una factura que YA
 *   EXISTIA, con un `now` posterior al de su creacion). `ventas.fecha` nunca
 *   se actualiza tras el INSERT (regla #2 CLAUDE.md — solo `saldo_pend_usd`
 *   se UPDATE-ea), asi que esta comparacion es estable para siempre.
 *
 * EMISION se muestra en MÉTODOS DE PAGO (es, a todo efecto, un metodo de
 * pago mas usado al momento de facturar). POST-EMISION se muestra en
 * EVOLUCIÓN (es un movimiento de dinero posterior a la emision, igual que
 * un abono o un reverso).
 */
function particionarSafAplicaciones(
  rows: SafAplicacionFacturaCxc[],
  fechaVenta: string
): { emision: SafAplicacionFacturaCxc[]; postEmision: SafAplicacionFacturaCxc[] } {
  const emision: SafAplicacionFacturaCxc[] = []
  const postEmision: SafAplicacionFacturaCxc[] = []
  for (const row of rows) {
    if (row.fecha === fechaVenta) emision.push(row)
    else postEmision.push(row)
  }
  return { emision, postEmision }
}

/**
 * Mapea las filas SAF-a-la-EMISION (ver `particionarSafAplicaciones`) a
 * lineas de pago sinteticas (misma forma que `ReciboPagoInput`, el input
 * crudo de `agruparPagosPorMetodo`) para que aparezcan en la seccion
 * MÉTODOS DE PAGO del recibo, junto al resto de metodos usados al momento
 * de crear la factura (efectivo, punto, etc.) — un SAF que pago la factura
 * EN SU PROPIA EMISION es, a todos los efectos de visualizacion, un metodo
 * de pago mas, NO un movimiento de evolucion posterior.
 *
 * `metodo_cobro_id` es un sentinel fijo (NO existe una fila real en
 * `metodos_cobro` con ese id) — `agruparPagosPorMetodo` solo lo usa como
 * clave de agrupacion/suma (2+ aplicaciones SAF a la emision de la MISMA
 * factura se suman en una sola linea, igual que 2 pagos con el mismo
 * metodo real). `monto` de `saf_creditos_aplicaciones` es SIEMPRE USD
 * (`monto_aplicado_usd`), nunca Bs — `moneda: 'USD'` fijo, consistente con
 * el dato de origen.
 */
function mapSafEmisionAPagos(rows: SafAplicacionFacturaCxc[]): ReciboPagoInput[] {
  return rows.map((r) => ({
    metodo_cobro_id: SAF_EMISION_METODO_ID,
    metodo_nombre: SAF_EMISION_METODO_NOMBRE,
    moneda: 'USD',
    monto: Number(r.monto),
  }))
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
  evolucion?: ReciboEvolucionInput,
  /**
   * Lineas de pago sinteticas (p.ej. SAF-a-la-emision, ver
   * `mapSafEmisionAPagos`) que se agregan a `pagos` ANTES de agruparse por
   * metodo (`agruparPagosPorMetodo`), para que aparezcan en MÉTODOS DE PAGO
   * junto a los pagos reales. Omitido/vacio => comportamiento byte-identical
   * a antes de PR9 (additive, mismo criterio que `evolucion`).
   */
  pagosExtra?: ReciboPagoInput[]
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
    pagos: [
      ...pagos.map((p) => ({
        metodo_cobro_id: p.metodo_cobro_id,
        metodo_nombre: p.metodo_nombre,
        moneda: p.moneda_label as 'USD' | 'BS',
        monto: Number(p.monto),
      })),
      ...(pagosExtra ?? []),
    ],
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
  const { safAplicaciones, isLoading: loadingSafAplicaciones } = useSafAplicacionesFactura(ventaId)

  if (!venta) {
    return { recibo: null, isLoading: false }
  }

  if (
    loadingDetalle ||
    loadingPagos ||
    loadingCompany ||
    loadingReversos ||
    loadingEvolucion ||
    loadingReembolsos ||
    loadingSafAplicaciones
  ) {
    return { recibo: null, isLoading: true }
  }

  const monedaPresentacion = opts?.derivarMonedaPresentacion
    ? parseEmpresaConfig(company?.config).moneda_presentacion_documentos
    : undefined

  // PR9 (saf-seccion-correcta): el SAF que pago ESTA factura EN SU PROPIA
  // EMISION va a MÉTODOS DE PAGO (via pagosExtra); el que la pago DESPUES
  // (CxC/abono-global) va a EVOLUCIÓN (via saldoAFavorAplicado). Ver doc de
  // `particionarSafAplicaciones` arriba — nunca ambas secciones a la vez
  // para la MISMA fila.
  const { emision: safEmision, postEmision: safPostEmision } = particionarSafAplicaciones(
    safAplicaciones,
    venta.fecha
  )

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
    // PR8/PR9: SAF CONSUMIDO/aplicado a ESTA factura DESPUES de su emision
    // (saf_creditos_aplicaciones con fecha > venta.fecha), distinto de
    // saldoAFavorGenerado (SAF que esta factura generó via NC/anticipo) y
    // del SAF-a-la-emision (que ahora va a MÉTODOS DE PAGO, no aqui).
    saldoAFavorAplicado: reducirSaldoAFavorAplicado(safPostEmision, venta.tasa),
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
    evolucion,
    mapSafEmisionAPagos(safEmision)
  )

  return { recibo, isLoading: false }
}
