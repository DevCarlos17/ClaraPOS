import { useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, CheckCircle, Warning, CaretUp, CaretDown, X, Trash } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { WizardStepIndicator } from '@/components/shared/wizard-step-indicator'
import { type WizardAcumuladorLinea } from '@/components/shared/wizard-acumulador'
import { useCompraWizardStore, type LineaWizardCompra } from '@/stores/compra-wizard-store'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useProveedoresActivos } from '@/features/proveedores/hooks/use-proveedores'
import { compraHeaderSchema, pagoCompraSchema, lineaCargoSchema, lineaCompraSchema } from '@/features/inventario/schemas/compra-schema'
import { crearCompra, type PagoCompraParam, type CrearCompraParams, type LineaCompra } from '@/features/inventario/hooks/use-compras'
import { totalizarLineasCargo } from '@/features/inventario/lib/compra-lineas-cargo'
import {
  getLineSubtotal,
  calcDesgloseUsd,
  calcCostoUnitarioUsd,
  convertirLineasCargo,
  calcTotalUsd,
  calcTotalUsdSistema,
  calcPendienteUsd,
} from '@/features/inventario/lib/compra-desglose'
import { derivarSenalesPvp, lineaTieneDecisionBloqueante } from '@/features/inventario/lib/compra-precio-gating'
import { costoTieneCambioSignificativo } from '@/features/inventario/lib/compra-pvp-decision'
import { formatUsd, formatBs } from '@/lib/currency'
import { PasoCabecera } from './steps/paso-cabecera'
import { PasoProductos } from './steps/paso-productos'
import { PasoCargosPagos } from './steps/paso-cargos-pagos'

const STEPS = [{ label: 'Datos' }, { label: 'Productos' }, { label: 'Cargos y pagos' }]

/**
 * Convierte `LineaWizardCompra` (store) al shape que espera `crearCompra`
 * (`use-compras.ts::LineaCompra`). 1:1 de `compra-form.tsx` L1055-1139
 * (bloque `lineasConvertidas`): calcula `costo_unitario_usd` (a tasa
 * proveedor, para CxP/total factura) y `costo_usd_sistema` (a tasa interna,
 * para inventario/contabilidad cuando hay tasa paralela), deriva
 * `costo_cambio` comparando el costo CONTABLE nuevo contra el guardado en la
 * ficha (`costo_usd_actual`, NUNCA el costo de factura ni el raw de
 * pantalla), y resuelve `no_actualizar_pvp`/`nuevo_precio_*_usd` via
 * `derivarSenalesPvp` (compra-precio-gating.ts) a partir de las decisiones
 * ya tomadas en `pvp_niveles` — el mismo predicado que persistencia usa para
 * escritorio, sin re-derivar la logica en dos lugares.
 */
function construirLineasParam(
  lineas: LineaWizardCompra[],
  moneda: 'USD' | 'BS',
  tasaFacturaNum: number,
  tasaInternaNum: number,
  usaTasaParalela: boolean
): LineaCompra[] {
  return lineas.map((l) => {
    const factor = l.factor > 0 ? l.factor : 1
    const cantidadBase = l.cantidad_input * factor

    // costoUnitarioUsd: unica fuente de verdad (compra-desglose.ts), reusada
    // tambien por `lineaCompraSchema`/`isStep2Valid` (compra-wizard-store.ts)
    // para validar — nunca se recalcula ad-hoc en un segundo lugar.
    const costoUnitarioUsd = calcCostoUnitarioUsd(l.costo_input, l.factor, moneda, tasaFacturaNum)

    let costoUsdSistema: number
    if (moneda === 'USD') {
      costoUsdSistema = usaTasaParalela && tasaInternaNum > 0 && tasaFacturaNum > 0
        ? new Decimal(costoUnitarioUsd).times(tasaFacturaNum).dividedBy(tasaInternaNum).toNumber()
        : costoUnitarioUsd
    } else {
      if (usaTasaParalela && tasaInternaNum > 0) {
        const costoBcvPerUnit = new Decimal(l.costo_input).dividedBy(tasaInternaNum).toNumber()
        costoUsdSistema = factor > 0 ? new Decimal(costoBcvPerUnit).dividedBy(factor).toNumber() : costoBcvPerUnit
      } else {
        costoUsdSistema = costoUnitarioUsd
      }
    }

    const costoUsdActual = parseFloat(l.costo_usd_actual) || 0
    const costoCambio = Math.abs(costoUsdSistema - costoUsdActual) > 0.0001

    const { noActualizarPvp, getNewPvpUsdForNivel } = derivarSenalesPvp(l.pvp_niveles, moneda, tasaFacturaNum)

    return {
      producto_id: l.producto_id,
      cantidad: cantidadBase,
      costo_unitario_usd: Number(costoUnitarioUsd.toFixed(8)),
      costo_usd_sistema: Number(costoUsdSistema.toFixed(8)),
      tipo_impuesto: l.tipo_impuesto,
      impuesto_pct: l.impuesto_pct,
      lote_nro: l.lote_nro.trim() || undefined,
      lote_fecha_fab: l.lote_fecha_fab || undefined,
      lote_fecha_venc: l.lote_fecha_venc || undefined,
      costo_cambio: costoCambio,
      no_actualizar_pvp: noActualizarPvp,
      nuevo_precio_venta_usd: getNewPvpUsdForNivel(1),
      nuevo_precio_mayor_usd: getNewPvpUsdForNivel(2),
      nuevo_precio_especial_usd: getNewPvpUsdForNivel(3),
    }
  })
}

/**
 * Resumen de confirmacion — version compacta del Dialog de confirmar de
 * `compra-form.tsx`, adaptada al espacio del BottomSheet mobile (mismo
 * patron que `ResumenGasto` en `gasto-wizard.tsx`).
 */
function ResumenCompra({
  proveedorNombre,
  fechaFactura,
  nroFactura,
  nroControl,
  moneda,
  tasaInterna,
  tasaProveedor,
  usaTasaParalela,
  tipoDetectado,
  totalUsd,
  totalBs,
  totalUsdSistema,
  cargosCount,
  pagosCount,
  pendienteUsd,
}: {
  proveedorNombre: string
  fechaFactura: string
  nroFactura: string
  nroControl: string
  moneda: 'USD' | 'BS'
  tasaInterna: number
  tasaProveedor: number
  usaTasaParalela: boolean
  tipoDetectado: 'CONTADO' | 'CREDITO'
  totalUsd: number
  totalBs: number
  totalUsdSistema: number
  cargosCount: number
  pagosCount: number
  pendienteUsd: number
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Resumen de la Factura</h3>
        <p className="text-xs text-muted-foreground">Verifica los datos antes de confirmar</p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm shadow-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Proveedor:</span>
          <span className="font-semibold text-foreground text-right max-w-[220px] truncate">{proveedorNombre}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Nro. Factura:</span>
          <span className="font-mono text-foreground">{nroFactura}</span>
        </div>
        {nroControl && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nro. Control:</span>
            <span className="font-mono text-foreground">{nroControl}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fecha:</span>
          <span className="font-mono text-foreground">{fechaFactura}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tasa interna:</span>
          <span className="text-foreground">{tasaInterna.toFixed(4)}</span>
        </div>
        {usaTasaParalela && tasaProveedor > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tasa proveedor:</span>
            <span className="text-foreground">{tasaProveedor.toFixed(4)}</span>
          </div>
        )}
        <div className="border-t border-border pt-2 mt-1 space-y-1">
          <div className="flex justify-between font-semibold">
            <span className="text-foreground">Total ({moneda}):</span>
            <span className="text-foreground">{moneda === 'USD' ? formatUsd(totalUsd) : formatBs(totalBs)}</span>
          </div>
          {usaTasaParalela && (
            <div className="flex justify-between text-muted-foreground text-xs">
              <span>Costo contabilidad (tasa int.):</span>
              <span>{formatUsd(totalUsdSistema)}</span>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {cargosCount > 0 ? `${cargosCount} cargo(s) adicional(es)` : 'Sin cargos adicionales'} ·{' '}
        {pagosCount > 0 ? `${pagosCount} pago(s) registrado(s)` : 'Sin pagos — se registra a crédito'}
      </p>

      {tipoDetectado === 'CREDITO' && pendienteUsd > 0.005 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
          <Warning className="h-3.5 w-3.5 shrink-0" />
          Saldo pendiente: {formatUsd(pendienteUsd)} — quedará en Cuentas por Pagar
        </div>
      )}
    </div>
  )
}

/**
 * Panel de carrito deslizable — lista los productos confirmados (`lineas`) +
 * cargos, con boton de desconfirmar por producto. Se abre desde el boton de
 * resumen en el footer (o swipe-up). Reemplaza al `WizardAcumulador` fijo.
 */
function PanelCarrito({
  open,
  onClose,
  lineas,
  cargosLineas,
  total,
  moneda,
  onDesconfirmar,
}: {
  open: boolean
  onClose: () => void
  lineas: LineaWizardCompra[]
  cargosLineas: WizardAcumuladorLinea[]
  total: { usd: number; bs: number }
  moneda: 'USD' | 'BS'
  onDesconfirmar: (idx: number) => void
}) {
  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-10 bg-card border-t rounded-t-2xl shadow-lg transition-transform duration-300 ease-in-out ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ maxHeight: '65%' }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Carrito ({lineas.length} producto{lineas.length !== 1 ? 's' : ''})
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="Cerrar carrito"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-y-auto px-4 py-3 space-y-2" style={{ maxHeight: 'calc(65vh - 48px)' }}>
        {lineas.length === 0 && cargosLineas.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Aún no hay productos confirmados</p>
        ) : (
          <>
            {lineas.map((l, idx) => {
              const subtotal = getLineSubtotal(l)
              return (
                <div key={l.producto_id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{l.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.cantidad_input} x {l.codigo}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-foreground tabular-nums">
                      {moneda === 'USD' ? formatUsd(subtotal) : formatBs(subtotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDesconfirmar(idx)}
                      title="Quitar del carrito"
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Desconfirmar producto"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
            {cargosLineas.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{c.titulo}</p>
                  {c.subtitulo && <p className="text-xs text-muted-foreground">{c.subtitulo}</p>}
                </div>
                <span className="font-semibold text-foreground tabular-nums shrink-0">{formatUsd(c.montoUsd)}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-1 flex justify-between font-bold text-foreground text-base">
              <span>Total</span>
              <div className="text-right">
                <p className="tabular-nums">{formatUsd(total.usd)}</p>
                <p className="text-xs font-normal text-muted-foreground tabular-nums">{formatBs(total.bs)}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Orquestador del wizard de compra (fullscreen mobile). Navegacion libre entre
 * los 3 pasos (clic en indicador + swipe horizontal + botones Atras/Continuar).
 * Solo el boton "Registrar compra" se bloquea hasta que los 3 pasos sean
 * validos. El carrito de productos confirmados vive en `PanelCarrito`
 * (deslizable). La logica fiscal del submit (`handleConfirmar`) es intacta.
 */
export function CompraWizard() {
  const { user } = useCurrentUser()
  const [guardando, setGuardando] = useState(false)
  const [mostrarRestaurar, setMostrarRestaurar] = useState(false)
  const [mostrarResumen, setMostrarResumen] = useState(false)
  const [carritoOpen, setCarritoOpen] = useState(false)

  const touchStartX = useRef<number | null>(null)
  const SWIPE_THRESHOLD = 50

  const {
    step,
    setStep,
    reset,
    closeSheet,
    fechaFactura,
    nroFactura,
    nroControl,
    proveedorId,
    moneda,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    lineas,
    lineasCargo,
    pagos,
    destinoCobro,
    sesionActivaId,
    isStep1Valid,
    isStep2Valid,
    isStep3Valid,
    guardarDraft,
    restaurarDraft,
    descartarBorrador,
    desconfirmarLinea,
  } = useCompraWizardStore()

  const { proveedores } = useProveedoresActivos()

  // Detectar borrador huerfano al montar (mismo patron que nueva-cita-wizard.tsx / gasto-wizard.tsx)
  useEffect(() => {
    const hayDraft = restaurarDraft()
    if (hayDraft) setMostrarRestaurar(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-guardado del borrador mientras se completa el wizard
  useEffect(() => {
    const hasData = Boolean(proveedorId || nroFactura.trim() || lineasCargo.length > 0 || pagos.length > 0)
    if (!hasData) return
    const timer = setTimeout(() => guardarDraft(), 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fechaFactura,
    nroFactura,
    nroControl,
    proveedorId,
    moneda,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    lineas,
    lineasCargo,
    pagos,
  ])

  const tasaFacturaNum = usaTasaParalela ? tasaProveedor : tasaInterna

  // ── Totales — 1:1 de compra-form.tsx, recompuestos via compra-desglose.ts
  // (mismo criterio que paso-cargos-pagos.tsx: el modulo no expone un hook
  // unificado, ver nota en ese archivo). ──
  const totalDisplay = useMemo(
    () => lineas.reduce((sum, l) => new Decimal(sum).plus(getLineSubtotal(l)).toNumber(), 0),
    [lineas]
  )
  const desgloseUsd = useMemo(
    () => calcDesgloseUsd(lineas, moneda, tasaFacturaNum),
    [lineas, moneda, tasaFacturaNum]
  )
  const totalIvaBs = useMemo(
    () =>
      lineas.reduce((sum, l) => {
        if (l.tipo_impuesto !== 'Gravable') return sum
        return new Decimal(sum).plus(new Decimal(getLineSubtotal(l)).times(l.impuesto_pct).dividedBy(100)).toNumber()
      }, 0),
    [lineas]
  )
  const totalIvaDisplay = moneda === 'USD' ? desgloseUsd.totalIvaUsd : totalIvaBs
  const totalConIvaDisplay = new Decimal(totalDisplay).plus(totalIvaDisplay).toNumber()

  const lineasCargoUsd = useMemo(
    () => convertirLineasCargo(lineasCargo, moneda, tasaFacturaNum),
    [lineasCargo, moneda, tasaFacturaNum]
  )
  const cargoTotales = useMemo(() => totalizarLineasCargo(lineasCargoUsd), [lineasCargoUsd])
  const totalCargoUsd = new Decimal(cargoTotales.exentoUsd).plus(cargoTotales.baseUsd).plus(cargoTotales.ivaUsd).toNumber()

  const totalUsd = calcTotalUsd(totalConIvaDisplay, totalCargoUsd, moneda, tasaFacturaNum)
  const totalBs = (
    moneda === 'BS'
      ? new Decimal(totalConIvaDisplay).plus(new Decimal(totalCargoUsd).times(tasaFacturaNum))
      : new Decimal(totalUsd).times(tasaFacturaNum)
  ).toNumber()
  const totalUsdSistema = calcTotalUsdSistema(totalDisplay, totalUsd, moneda, tasaFacturaNum, tasaInterna, usaTasaParalela)
  const pendienteUsd = calcPendienteUsd(totalUsd, pagos, tasaFacturaNum)
  const tipoDetectado: 'CONTADO' | 'CREDITO' = pendienteUsd <= 0.01 ? 'CONTADO' : 'CREDITO'

  const proveedorSeleccionado = proveedores.find((p) => p.id === proveedorId)

  const acumuladorLineas: WizardAcumuladorLinea[] = [
    ...lineas.map((l) => {
      const subtotalDisplay = getLineSubtotal(l)
      const subtotalUsd = moneda === 'USD' ? subtotalDisplay : (tasaFacturaNum > 0 ? subtotalDisplay / tasaFacturaNum : 0)
      return {
        id: l.producto_id,
        titulo: l.nombre,
        subtitulo: `${l.cantidad_input} x ${l.codigo}`,
        montoUsd: subtotalUsd,
        montoBs: tasaFacturaNum > 0 ? subtotalUsd * tasaFacturaNum : 0,
      }
    }),
    ...lineasCargoUsd.map((c) => ({
      id: c.id,
      titulo: c.concepto === 'EMPAQUE' ? 'Material de empaque' : 'Flete',
      subtitulo: c.porcentaje_iva > 0 ? `IVA ${c.porcentaje_iva}%` : undefined,
      montoUsd: c.monto,
      montoBs: tasaFacturaNum > 0 ? c.monto * tasaFacturaNum : 0,
    })),
  ]
  const acumuladorTotal = { usd: totalUsd, bs: totalBs }

  const STEP_COMPONENTS = [<PasoCabecera key="1" />, <PasoProductos key="2" />, <PasoCargosPagos key="3" />]

  const canProcesar = isStep1Valid() && isStep2Valid() && isStep3Valid() && lineas.length > 0

  function irAPaso(n: 1 | 2 | 3) {
    setCarritoOpen(false)
    setMostrarResumen(false)
    setStep(n)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(delta) < SWIPE_THRESHOLD) return
    if (delta < 0 && step < 3) irAPaso((step + 1) as 1 | 2 | 3)
    if (delta > 0 && step > 1) irAPaso((step - 1) as 1 | 2 | 3)
  }

  async function handleConfirmar() {
    if (!user?.empresa_id) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    // ── crearCompra exige al menos 1 linea de producto (use-compras.ts:
    // "Debe agregar al menos una linea a la compra") — 1:1 del guard de
    // `compra-form.tsx` L1013-1016. Defensa en profundidad: `isStep2Valid()`
    // ya bloquea la navegacion al Paso 3 en este mismo caso.
    if (lineas.length === 0) {
      toast.error('Debe agregar al menos un producto')
      return
    }

    // Segunda barrera (defensa en profundidad, igual que `compra-form.tsx`
    // L1086-1098): cada linea DEBE pasar `lineaCompraSchema` — cantidad y
    // costo_unitario_usd positivos, finitos, dentro del tope NUMERIC. Sin
    // esto, una linea con cantidad/costo en 0 (el input mobile permite 0,
    // a diferencia del `min="0.001"` HTML-only del input desktop) escribiria
    // un `movimiento_inventario` inmutable con cantidad/costo cero. Misma
    // instancia del schema que `compra-form.tsx` usa — jamas se relaja aca.
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i]
      const factorLinea = l.factor > 0 ? l.factor : 1
      const parsedLinea = lineaCompraSchema.safeParse({
        producto_id: l.producto_id,
        cantidad: l.cantidad_input * factorLinea,
        costo_unitario_usd: calcCostoUnitarioUsd(l.costo_input, l.factor, moneda, tasaFacturaNum),
        tipo_impuesto: l.tipo_impuesto,
        impuesto_pct: l.impuesto_pct,
      })
      if (!parsedLinea.success) {
        const msg = parsedLinea.error.issues[0]?.message ?? 'Error en línea'
        toast.error(`Línea ${i + 1} (${l.nombre}): ${msg}`)
        return
      }
    }

    // Tercera barrera (defensa en profundidad, igual que `compra-form.tsx`
    // L1044-1052): bloquear si alguna linea con cambio de costo tiene una
    // decision de PVP sin resolver. `isStep2Valid()` ya impide llegar aca en
    // ese estado, pero el submit no debe confiar solo en la navegacion.
    const lineasConConflicto = lineas.filter((l) =>
      lineaTieneDecisionBloqueante(
        costoTieneCambioSignificativo(l.costo_input, l.costo_actual, { moneda, tasaFacturaNum }),
        l.pvp_niveles
      )
    )
    if (lineasConConflicto.length > 0) {
      const nombres = lineasConConflicto.map((l) => l.nombre).join(', ')
      toast.error(`Corregí el PVP de: ${nombres}`)
      return
    }

    if (tasaInterna <= 0) {
      toast.error('Ingrese la tasa interna (Bs/USD)')
      return
    }
    if (usaTasaParalela && tasaProveedor <= 0) {
      toast.error('Ingrese la tasa del proveedor para usar tasa paralela')
      return
    }

    const headerParsed = compraHeaderSchema.safeParse({
      proveedor_id: proveedorId,
      tasa: tasaFacturaNum,
      fecha_factura: fechaFactura,
      nro_factura: nroFactura,
      nro_control: nroControl || undefined,
      moneda,
    })
    if (!headerParsed.success) {
      toast.error(headerParsed.error.issues[0]?.message ?? 'Datos inválidos, revisa la cabecera')
      return
    }

    const lineaCargoIncompleta = lineasCargo.find(
      (l) => l.monto_input.trim() === '' || isNaN(parseFloat(l.monto_input)) || parseFloat(l.monto_input) <= 0
    )
    if (lineaCargoIncompleta) {
      const nombreConcepto = lineaCargoIncompleta.concepto === 'EMPAQUE' ? 'material de empaque' : 'flete'
      toast.error(`Completá el monto de la línea de ${nombreConcepto} o eliminala antes de procesar.`)
      return
    }

    for (const l of lineasCargoUsd) {
      const parsedCargo = lineaCargoSchema.safeParse({
        concepto: l.concepto,
        monto: l.monto,
        porcentaje_iva: l.porcentaje_iva,
      })
      if (!parsedCargo.success) {
        const nombreConcepto = l.concepto === 'EMPAQUE' ? 'Material de empaque' : 'Flete'
        toast.error(`${nombreConcepto}: ${parsedCargo.error.issues[0]?.message ?? 'Error en linea de cargo'}`)
        return
      }
    }

    const pagosParam: PagoCompraParam[] = pagos.map((p) => ({
      metodo_cobro_id: p.metodo_cobro_id,
      moneda: p.moneda,
      monto: p.monto,
      banco_empresa_id: p.banco_empresa_id,
      referencia: p.referencia,
      sesion_caja_id: destinoCobro === 'CAJA' ? sesionActivaId : null,
    }))

    for (let i = 0; i < pagos.length; i++) {
      const p = pagos[i]
      const parsedPago = pagoCompraSchema.safeParse({
        metodo_cobro_id: p.metodo_cobro_id,
        moneda: p.moneda,
        monto: p.monto,
        banco_empresa_id: p.banco_empresa_id ?? null,
        referencia: p.referencia,
      })
      if (!parsedPago.success) {
        toast.error(`Pago ${i + 1} (${p.metodo_nombre}): ${parsedPago.error.issues[0]?.message ?? 'Error en pago'}`)
        return
      }
    }

    const params: CrearCompraParams = {
      proveedor_id: headerParsed.data.proveedor_id,
      tasa: tasaFacturaNum,
      tasa_costo: usaTasaParalela ? tasaInterna : undefined,
      fecha_factura: headerParsed.data.fecha_factura,
      nro_factura: headerParsed.data.nro_factura,
      nro_control: headerParsed.data.nro_control,
      moneda: headerParsed.data.moneda,
      lineas: construirLineasParam(lineas, moneda, tasaFacturaNum, tasaInterna, usaTasaParalela),
      lineasCargo: lineasCargoUsd,
      pagos: pagosParam,
      usuario_id: user.id,
      empresa_id: user.empresa_id,
    }

    setGuardando(true)
    try {
      const result = await crearCompra(params)
      toast.success(`Factura ${result.nroFactura} registrada exitosamente`)
      reset()
      closeSheet()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <Dialog open={mostrarRestaurar} onOpenChange={setMostrarRestaurar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrador encontrado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Hay una factura de compra sin finalizar. ¿Deseas continuar donde la dejaste?
          </p>
          <DialogFooter>
            <Button
              variant="secondary"
              className="h-10 rounded-xl"
              onClick={() => {
                descartarBorrador()
                setMostrarRestaurar(false)
              }}
            >
              Descartar
            </Button>
            <Button className="h-10 rounded-xl" onClick={() => setMostrarRestaurar(false)}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col h-full relative">
        {/* Indicador de pasos — navegacion libre (solo activo iluminado) */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <WizardStepIndicator
            steps={STEPS}
            currentStep={step}
            completedSteps={[]}
            onStepClick={(n: number) => irAPaso(n as 1 | 2 | 3)}
            freeNavigation
          />
        </div>

        {/* Contenido — scrolleable + swipe horizontal */}
        <div
          className="flex-1 overflow-y-auto px-4 pb-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {mostrarResumen ? (
            <ResumenCompra
              proveedorNombre={proveedorSeleccionado?.razon_social ?? '—'}
              fechaFactura={fechaFactura}
              nroFactura={nroFactura}
              nroControl={nroControl}
              moneda={moneda}
              tasaInterna={tasaInterna}
              tasaProveedor={tasaProveedor}
              usaTasaParalela={usaTasaParalela}
              tipoDetectado={tipoDetectado}
              totalUsd={totalUsd}
              totalBs={totalBs}
              totalUsdSistema={totalUsdSistema}
              cargosCount={lineasCargo.length}
              pagosCount={pagos.length}
              pendienteUsd={pendienteUsd}
            />
          ) : (
            STEP_COMPONENTS[step - 1]
          )}

          {/* Hint de swipe */}
          {!mostrarResumen && step < 3 && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60 select-none">
              <ArrowLeft size={12} className="animate-pulse" />
              Deslizá o usá los botones para avanzar
              <ArrowRight size={12} className="animate-pulse" />
            </p>
          )}
        </div>

        {/* Footer — 2 filas: navegacion + acciones */}
        <div className="shrink-0 border-t bg-background px-4 py-3 space-y-2.5">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="h-11 rounded-xl gap-2 flex-1 text-base"
              onClick={() => {
                if (mostrarResumen) { setMostrarResumen(false); return }
                irAPaso((step - 1) as 1 | 2 | 3)
              }}
              disabled={!mostrarResumen && step === 1}
            >
              <ArrowLeft size={18} />
              Atrás
            </Button>
            {!mostrarResumen && (
              <Button
                className="h-11 rounded-xl gap-2 flex-1 text-base"
                onClick={() => irAPaso((step + 1) as 1 | 2 | 3)}
                disabled={step === 3}
              >
                Continuar
                <ArrowRight size={18} />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCarritoOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              aria-label={carritoOpen ? 'Cerrar carrito' : 'Ver carrito'}
            >
              {carritoOpen ? <CaretDown className="h-3.5 w-3.5" /> : <CaretUp className="h-3.5 w-3.5" />}
              {lineas.length > 0 ? `${lineas.length} item(s)` : 'Carrito'}
            </button>

            <div className="flex-1" />

            <Button
              variant="ghost"
              className="h-10 rounded-xl text-muted-foreground"
              onClick={() => { reset(); closeSheet() }}
            >
              Cancelar
            </Button>

            <Button
              className="h-11 rounded-xl text-base gap-2 bg-green-600 hover:bg-green-700"
              onClick={() => (mostrarResumen ? handleConfirmar() : setMostrarResumen(true))}
              disabled={!canProcesar || guardando}
              title={!canProcesar ? 'Completá los datos y agregá al menos un producto' : undefined}
            >
              <CheckCircle size={16} />
              {guardando ? 'Registrando...' : mostrarResumen ? 'Confirmar' : 'Registrar'}
            </Button>
          </div>
        </div>

        {/* Panel carrito deslizable */}
        <PanelCarrito
          open={carritoOpen}
          onClose={() => setCarritoOpen(false)}
          lineas={lineas}
          cargosLineas={acumuladorLineas.filter((a) => !lineas.some((l) => l.producto_id === a.id))}
          total={acumuladorTotal}
          moneda={moneda}
          onDesconfirmar={(idx) => desconfirmarLinea(idx)}
        />
      </div>
    </>
  )
}
