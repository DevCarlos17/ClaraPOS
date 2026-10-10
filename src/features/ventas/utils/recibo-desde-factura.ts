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
  type ReversoFacturaRow,
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
  // forzarBimonetario: true -- moneda:'USD' aqui es un label interno fijo del sentinel
  // SAF-emision, NO una eleccion real de moneda del usuario (a diferencia de un metodo
  // de cobro real). Sin este flag, formatMontoPago colapsa la linea a solo-USD cuando
  // monedaPresentacion default es 'USD', ocultando el equivalente en Bs (engram #5237).
  return rows.map((r) => ({
    metodo_cobro_id: SAF_EMISION_METODO_ID,
    metodo_nombre: SAF_EMISION_METODO_NOMBRE,
    moneda: 'USD',
    monto: Number(r.monto),
    forzarBimonetario: true,
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
 * Particiona `pagos` (filas `pagos` de un `venta_id`) segun el momento en
 * que el pago se aplico a ESTA factura — MISMO discriminador de
 * `particionarSafAplicaciones` arriba (PR9), extendido a pagos reales
 * (efectivo, transferencia, punto, etc. — PR10, engram #5228/#5222):
 *
 * - EMISION: `pg.fecha === venta.fecha` — el pago se registro en el MISMO
 *   `writeTransaction`/`now` en que esa factura se creo en POS
 *   (`use-ventas.ts` crearVenta, INSERT directo a `pagos` sin pasar por
 *   `aplicarPagoFacturaEnTx`, linea ~857-876, mismo `now` que `ventas.fecha`).
 * - POST-EMISION: cualquier otra fecha — CxC `registrarPagoFactura`/
 *   `registrarAbonoGlobal` (via `aplicarPagoFacturaEnTx` o INSERT directo
 *   dentro del FIFO) paga una factura que YA EXISTIA, o POS asigna el
 *   excedente SAF a una factura antigua (`isPosAllocation`, tambien via
 *   `aplicarPagoFacturaEnTx`). `ventas.fecha` nunca se actualiza tras el
 *   INSERT (regla #2 CLAUDE.md), asi que la comparacion es estable.
 *
 * EMISION se muestra en MÉTODOS DE PAGO (via `agruparPagosPorMetodo`,
 * comportamiento preexistente). POST-EMISION se EXCLUYE de MÉTODOS DE
 * PAGO — a proposito NO se re-agrega como linea nueva en EVOLUCIÓN aqui:
 * para el camino mas comun de abono a UNA factura especifica
 * (`registrarPagoFactura`, o la asignacion de excedente POS a una factura
 * antigua) ya existe una fila PAREADA 1:1 en `movimientos_cuenta` (MISMO
 * `venta_id`+`fecha`, ver `aplicarPagoFacturaEnTx` use-cxc.ts:528-587) que
 * `useEvolucionFactura` YA surte a `evolucion.abonos` — volver a agregar
 * una segunda linea aqui duplicaria el monto mostrado (double-count),
 * exactamente el bug opuesto al que se esta arreglando.
 *
 * LIMITACION CONOCIDA (preexistente a este fix, fuera de su alcance):
 * `registrarAbonoGlobal` (abono FIFO que cruza MULTIPLES facturas,
 * use-cxc.ts ~1006-1162) inserta 1 fila `pagos` POR factura tocada (con su
 * `venta_id` real) pero UNA UNICA fila agregada `movimientos_cuenta` con
 * `venta_id = NULL` (no hay forma de atribuirla a una factura especifica)
 * — para ESE camino puntual, un pago post-emision queda excluido de
 * MÉTODOS DE PAGO (correcto) pero sin replacement visible en EVOLUCIÓN
 * para esta factura. Antes de este fix ese mismo pago SI se mostraba,
 * erroneamente, en MÉTODOS DE PAGO — este fix no lo empeora, solo deja de
 * arreglarlo por completo (ver reporte de PR10).
 */
function particionarPagosPorEmision(
  pagos: PagoFacturaCxc[],
  fechaVenta: string
): { emision: PagoFacturaCxc[]; postEmision: PagoFacturaCxc[] } {
  const emision: PagoFacturaCxc[] = []
  const postEmision: PagoFacturaCxc[] = []
  for (const row of pagos) {
    if (row.fecha === fechaVenta) emision.push(row)
    else postEmision.push(row)
  }
  return { emision, postEmision }
}

/**
 * Bundle de datos crudos de evolucion + pagos necesarios para construir
 * `evolucion`/`pagosExtra`/pagos-de-metodos de una factura (PR8/PR9 SAF +
 * PR10 cash). Mismo shape que las queries de evolucion que ya consume
 * `useReciboDesdeFactura` — extraido a una funcion PURA para que los
 * consumidores FROZEN (p.ej. `nota-credito-pos-modal.tsx`, que mantiene sus
 * propios hooks por diseno — ver doc de `useReciboDesdeFactura` abajo)
 * puedan reusar la MISMA logica de particion/construccion sin duplicarla a
 * mano (como ocurria antes de PR10 con solo 4/7 parametros, engram #5228).
 */
export interface DatosEvolucionFactura {
  reversos: ReversoFacturaRow[]
  reembolsos: ReembolsoTesoreriaFacturaRow[]
  abonos: EvolucionFacturaRow[]
  reversosPago: EvolucionFacturaRow[]
  saldoAFavor: EvolucionFacturaRow[]
  safAplicaciones: SafAplicacionFacturaCxc[]
  pagos: PagoFacturaCxc[]
}

/**
 * Pura. Particiona SAF (PR9) y pagos (PR10) por emision-vs-post-emision y
 * construye `evolucion` (seccion EVOLUCIÓN) + `pagosExtra` (SAF-a-la-
 * emision, sintetico) + `pagosMetodos` (pagos reales SOLO de la emision,
 * listos para `agruparPagosPorMetodo`). Usado por `useReciboDesdeFactura` y
 * por los consumidores FROZEN que arman `ReciboData` a mano.
 */
export function construirEvolucionYPagosFactura(
  venta: { fecha: string; tasa: string },
  datos: DatosEvolucionFactura
): { pagosMetodos: PagoFacturaCxc[]; pagosExtra: ReciboPagoInput[]; evolucion: ReciboEvolucionInput } {
  const { emision: safEmision, postEmision: safPostEmision } = particionarSafAplicaciones(
    datos.safAplicaciones,
    venta.fecha
  )
  const { emision: pagosMetodos } = particionarPagosPorEmision(datos.pagos, venta.fecha)

  const evolucion: ReciboEvolucionInput = {
    reversos: agruparReversosPorNc(datos.reversos).map((r) => ({
      nroNcr: r.nroNcr,
      tipo: r.tipo,
      fecha: r.fecha,
      totalUsd: r.montoUsd,
      totalBs: r.montoBs,
      metodosReembolso: datos.reembolsos
        .filter((e) => e.notaCreditoId === r.notaCreditoId)
        .map((e) => mapReembolsoMetodo(e, venta.tasa)),
    })),
    abonos: datos.abonos.map((r) => mapEvolucionMovimiento(r, venta.tasa)),
    reversosPago: datos.reversosPago.map((r) => mapEvolucionMovimiento(r, venta.tasa)),
    saldoAFavorGenerado: reducirSaldoAFavorGenerado(datos.saldoAFavor, venta.tasa),
    saldoAFavorAplicado: reducirSaldoAFavorAplicado(safPostEmision, venta.tasa),
  }

  return {
    pagosMetodos,
    pagosExtra: mapSafEmisionAPagos(safEmision),
    evolucion,
  }
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

  // PR9 (SAF) + PR10 (cash): particiona SAF y pagos por emision-vs-post-
  // emision y construye evolucion/pagosExtra/pagosMetodos — ver doc de
  // `construirEvolucionYPagosFactura` arriba. Nunca ambas secciones a la
  // vez para la MISMA fila/pago.
  const { pagosMetodos, pagosExtra, evolucion } = construirEvolucionYPagosFactura(
    { fecha: venta.fecha, tasa: venta.tasa },
    { reversos, reembolsos, abonos, reversosPago, saldoAFavor, safAplicaciones, pagos }
  )

  const recibo = buildReciboDataDesdeFacturaGuardada(
    venta,
    detalle,
    pagosMetodos,
    company,
    {
      esReimpresion: opts?.esReimpresion,
      monedaPresentacion,
    },
    evolucion,
    pagosExtra
  )

  return { recibo, isLoading: false }
}
