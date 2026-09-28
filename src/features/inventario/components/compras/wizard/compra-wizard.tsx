import { useEffect, useMemo, useState } from 'react'
import Decimal from 'decimal.js'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, CheckCircle, Warning, Package, Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { WizardStepIndicator } from '@/components/shared/wizard-step-indicator'
import { WizardAcumulador, type WizardAcumuladorLinea } from '@/components/shared/wizard-acumulador'
import { useCompraWizardStore, type LineaWizardCompra } from '@/stores/compra-wizard-store'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useProveedoresActivos } from '@/features/proveedores/hooks/use-proveedores'
import { compraHeaderSchema, pagoCompraSchema, lineaCargoSchema } from '@/features/inventario/schemas/compra-schema'
import { crearCompra, type PagoCompraParam, type CrearCompraParams, type LineaCompra } from '@/features/inventario/hooks/use-compras'
import { totalizarLineasCargo } from '@/features/inventario/lib/compra-lineas-cargo'
import {
  getLineSubtotal,
  calcDesgloseUsd,
  convertirLineasCargo,
  calcTotalUsd,
  calcTotalUsdSistema,
  calcPendienteUsd,
} from '@/features/inventario/lib/compra-desglose'
import { formatUsd, formatBs } from '@/lib/currency'
import { PasoCabecera } from './steps/paso-cabecera'
import { PasoCargosPagos } from './steps/paso-cargos-pagos'

const STEPS = [{ label: 'Datos' }, { label: 'Productos' }, { label: 'Cargos y pagos' }]

/**
 * Paso 2 (Productos) — PLACEHOLDER hasta W4b-i (`paso-productos.tsx`).
 * `isStep2Valid` ya permite 0 lineas (W3a, TODO explicito) para que la
 * navegacion no quede bloqueada mientras no existe la UI real.
 */
function PasoProductosPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
      <Package className="h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground max-w-xs">
        La carga de productos llega en la próxima actualización
      </p>
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-medium cursor-not-allowed opacity-60"
      >
        <Plus className="h-4 w-4" />
        Agregar productos
      </button>
    </div>
  )
}

/**
 * Convierte `LineaWizardCompra` (store) al shape que espera `crearCompra`
 * (`use-compras.ts::LineaCompra`). Mapeo MINIMO: los senales de PVP
 * (`nuevo_precio_*_usd`, `no_actualizar_pvp`, `costo_cambio`) se resuelven
 * en `compra-precio-gating.ts` (W4a/W4b-ii), fuera del alcance asignado a
 * W3b — `lineas` esta SIEMPRE vacio en este PR (Paso 2 es un placeholder),
 * asi que este mapeo no se ejecuta en la practica todavia; se deja correcto
 * para cuando W4b-i popule `lineas` de verdad.
 */
function construirLineasParam(
  lineas: LineaWizardCompra[],
  moneda: 'USD' | 'BS',
  tasaFacturaNum: number
): LineaCompra[] {
  return lineas.map((l) => {
    const factor = l.factor > 0 ? l.factor : 1
    const costoUnitarioUsd = moneda === 'USD'
      ? new Decimal(l.costo_input).dividedBy(factor).toNumber()
      : (tasaFacturaNum > 0 ? new Decimal(l.costo_input).dividedBy(tasaFacturaNum).dividedBy(factor).toNumber() : 0)
    return {
      producto_id: l.producto_id,
      cantidad: l.cantidad_input * factor,
      costo_unitario_usd: Number(costoUnitarioUsd.toFixed(8)),
      tipo_impuesto: l.tipo_impuesto,
      impuesto_pct: l.impuesto_pct,
      lote_nro: l.lote_nro.trim() || undefined,
      lote_fecha_fab: l.lote_fecha_fab || undefined,
      lote_fecha_venc: l.lote_fecha_venc || undefined,
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
 * Orquestador del wizard de compra — `WizardStepIndicator` + `WizardAcumulador`
 * + routing 1→2→3 + resumen de confirmacion + submit (`crearCompra`, MISMA
 * mutacion que `compra-form.tsx`). Sin props: consume `useCompraWizardStore()`
 * para todo el estado, incluida la recuperacion de borrador y el submit final.
 */
export function CompraWizard() {
  const { user } = useCurrentUser()
  const [guardando, setGuardando] = useState(false)
  const [mostrarRestaurar, setMostrarRestaurar] = useState(false)
  const [mostrarResumen, setMostrarResumen] = useState(false)

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

  const STEP_COMPONENTS = [<PasoCabecera key="1" />, <PasoProductosPlaceholder key="2" />, <PasoCargosPagos key="3" />]

  function canGoNext(): boolean {
    if (step === 1) return isStep1Valid()
    if (step === 2) return isStep2Valid()
    if (step === 3) return isStep3Valid()
    return false
  }

  function goNext() {
    if (step < 3) {
      setStep((step + 1) as 1 | 2 | 3)
    } else {
      setMostrarResumen(true)
    }
  }

  function goBack() {
    if (mostrarResumen) {
      setMostrarResumen(false)
      return
    }
    if (step > 1) {
      setStep((step - 1) as 1 | 2 | 3)
    } else {
      reset()
      closeSheet()
    }
  }

  async function handleConfirmar() {
    if (!user?.empresa_id) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    // ── crearCompra exige al menos 1 linea de producto (use-compras.ts:
    // "Debe agregar al menos una linea a la compra") — el Paso 2 de ESTE PR
    // es un placeholder sin UI de productos (llega en W4b-i), asi que el
    // registro queda bloqueado aca con el mismo mensaje que compra-form.tsx
    // hasta que exista forma de agregar productos desde el wizard.
    if (lineas.length === 0) {
      toast.error('Debe agregar al menos un producto — disponible en la próxima actualización')
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
      lineas: construirLineasParam(lineas, moneda, tasaFacturaNum),
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
                reset()
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

      <div className="flex flex-col gap-4">
        <WizardStepIndicator
          steps={STEPS}
          currentStep={step}
          completedSteps={
            mostrarResumen ? [1, 2, 3] : Array.from({ length: step - 1 }, (_, i) => i + 1)
          }
          onStepClick={(n: number) => {
            setMostrarResumen(false)
            setStep(n as 1 | 2 | 3)
          }}
        />

        <WizardAcumulador
          lineas={acumuladorLineas}
          total={acumuladorTotal}
          defaultCollapsed={step !== 3}
          emptyMessage="Aún no hay productos ni cargos agregados"
        />

        <div className="flex-1">
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
        </div>

        <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t flex gap-3 mt-2">
          <Button variant="secondary" className="h-10 rounded-xl gap-2.5" onClick={goBack}>
            <ArrowLeft size={16} />
            {step === 1 && !mostrarResumen ? 'Cancelar' : 'Atrás'}
          </Button>
          <div className="flex-1" />
          {!mostrarResumen ? (
            <Button className="h-11 rounded-xl text-base gap-2" onClick={goNext} disabled={!canGoNext()}>
              Continuar
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              className="h-11 rounded-xl text-base gap-2 bg-green-600 hover:bg-green-700"
              onClick={handleConfirmar}
              disabled={guardando || lineas.length === 0}
              title={lineas.length === 0 ? 'Disponible cuando agregues productos (próxima actualización)' : undefined}
            >
              <CheckCircle size={16} />
              {guardando ? 'Registrando...' : 'Registrar compra'}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
