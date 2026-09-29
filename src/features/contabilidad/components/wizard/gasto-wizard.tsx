import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { CheckCircle, CaretUp, CaretDown, X, ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { WizardStepIndicator } from '@/components/shared/wizard-step-indicator'
import { useGastoWizardStore } from '@/stores/gasto-wizard-store'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosCxP } from '@/features/configuracion/hooks/use-payment-methods'
import { useGastoTotales } from '@/features/contabilidad/lib/use-gasto-totales'
import { gastoSchema } from '@/features/contabilidad/schemas/gasto-schema'
import { crearGasto, type GastoPago } from '@/features/contabilidad/hooks/use-gastos'
import { usdToBs, formatUsd } from '@/lib/currency'
import { PasoIdentificacion } from './paso-identificacion'
import { PasoMonto } from './paso-monto'
import { PasoPagos } from './paso-pagos'

const STEPS = [{ label: 'Identificación' }, { label: 'Monto' }, { label: 'Pagos' }]

/**
 * Panel de resumen deslizable — se muestra desde el borde inferior del wizard
 * al pulsar el handle o hacer swipe-up. Lista los abonos registrados y el
 * total contable. Se cierra al pulsar el handle de nuevo o el boton X.
 */
function PanelResumenAbonos({
  open,
  onClose,
  lineas,
  total,
  emptyMessage,
}: {
  open: boolean
  onClose: () => void
  lineas: { id: string; titulo: string; subtitulo?: string; montoUsd: number; montoBs: number }[]
  total: { usd: number; bs: number }
  emptyMessage: string
}) {
  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-10 bg-card border-t rounded-t-2xl shadow-lg transition-transform duration-300 ease-in-out ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ maxHeight: '60%' }}
    >
      {/* Handle */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Resumen de abonos
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="Cerrar resumen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-y-auto px-4 py-3 space-y-2" style={{ maxHeight: 'calc(60vh - 48px)' }}>
        {lineas.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{emptyMessage}</p>
        ) : (
          <>
            {lineas.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{l.titulo}</p>
                  {l.subtitulo && <p className="text-xs text-muted-foreground truncate">{l.subtitulo}</p>}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="font-semibold text-foreground tabular-nums">{formatUsd(l.montoUsd)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {l.montoBs.toFixed(2)} Bs
                  </p>
                </div>
              </div>
            ))}
            <div className="border-t pt-2 mt-1 flex justify-between font-bold text-foreground text-base">
              <span>Total</span>
              <div className="text-right">
                <p className="tabular-nums">{formatUsd(total.usd)}</p>
                <p className="text-xs font-normal text-muted-foreground tabular-nums">
                  {total.bs.toFixed(2)} Bs
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Orquestador del wizard de gasto (fullscreen mobile). Navegacion libre entre
 * los 3 pasos via clic en el indicador de pasos — sin bloqueos por paso. Solo
 * el boton "Registrar gasto" se bloquea hasta que los 3 pasos sean validos.
 *
 * El `WizardAcumulador` fue reemplazado por `PanelResumenAbonos`, un panel
 * deslizable desde el borde inferior activado por un handle/boton en el footer.
 */
export function GastoWizard() {
  const { user } = useCurrentUser()
  const [guardando, setGuardando] = useState(false)
  const [mostrarRestaurar, setMostrarRestaurar] = useState(false)
  const [resumenOpen, setResumenOpen] = useState(false)

  // Swipe horizontal para cambiar de paso
  const touchStartX = useRef<number | null>(null)
  const SWIPE_THRESHOLD = 50

  const {
    step,
    setStep,
    reset,
    closeSheet,
    nroFactura,
    nroControl,
    cuentaId,
    proveedorId,
    descripcion,
    fecha,
    observaciones,
    monedaFactura,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    montoFactura,
    tipoImpuesto,
    porcentajeIva,
    pagos,
    destinoCobro,
    sesionActivaId,
    isStep1Valid,
    isStep2Valid,
    isStep3Valid,
    hidratarDesdeBorrador,
    guardarDraft,
    descartarBorrador,
    descartado,
  } = useGastoWizardStore()

  const { metodos } = useMetodosCxP()

  useEffect(() => {
    const hayDraft = hidratarDesdeBorrador()
    if (hayDraft) setMostrarRestaurar(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!user?.empresa_id) return
    if (descartado) return // no re-persistir tras Descartar
    const hasData = Boolean(cuentaId || descripcion.trim() || montoFactura)
    if (!hasData) return
    const timer = setTimeout(() => guardarDraft(user.empresa_id!), 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nroFactura,
    nroControl,
    cuentaId,
    proveedorId,
    descripcion,
    fecha,
    monedaFactura,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    montoFactura,
    tipoImpuesto,
    porcentajeIva,
    pagos,
    observaciones,
    user?.empresa_id,
  ])

  const {
    montoContableUsd,
    abonoPagoProveedorUsd,
    abonoPagoInternoUsd,
  } = useGastoTotales({
    monedaFactura,
    usaTasaParalela,
    tasaInterna,
    tasaProveedor,
    montoFactura,
    tipoImpuesto,
    porcentajeIva,
    pagos,
  })

  const tasaInternaNum = parseFloat(tasaInterna) || 0

  const acumuladorLineas = pagos.map((p) => {
    const metodo = metodos.find((m) => m.id === p.metodo_cobro_id)
    const usd = abonoPagoProveedorUsd(p)
    return {
      id: p.id,
      titulo: metodo?.nombre ?? 'Abono sin método',
      subtitulo: p.referencia || undefined,
      montoUsd: usd,
      montoBs: usdToBs(usd, tasaInternaNum).toNumber(),
    }
  })
  const acumuladorTotal = {
    usd: montoContableUsd ?? 0,
    bs: usdToBs(montoContableUsd ?? 0, tasaInternaNum).toNumber(),
  }

  const canProcesar = isStep1Valid() && isStep2Valid() && isStep3Valid()

  const STEP_COMPONENTS = [<PasoIdentificacion key="1" />, <PasoMonto key="2" />, <PasoPagos key="3" />]

  function irAPaso(n: 1 | 2 | 3) {
    setResumenOpen(false)
    setStep(n)
  }

  function handleStepClick(n: number) {
    irAPaso(n as 1 | 2 | 3)
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

    const pagosPayload: GastoPago[] = pagos.map((p) => {
      const montoMoneda = parseFloat(p.monto) || 0
      const tasaProveedorNum = parseFloat(tasaProveedor) || 0
      const tasaPago =
        p.moneda === 'BS'
          ? usaTasaParalela && tasaProveedorNum > 0
            ? tasaProveedorNum
            : tasaInternaNum
          : tasaInternaNum
      return {
        metodo_cobro_id: p.metodo_cobro_id,
        banco_empresa_id: p.banco_empresa_id || undefined,
        moneda: p.moneda,
        monto_moneda: montoMoneda,
        tasa_pago: tasaPago,
        monto_usd: abonoPagoProveedorUsd(p),
        monto_usd_interno: abonoPagoInternoUsd(p),
        referencia: p.referencia.trim() || undefined,
        sesion_caja_id: destinoCobro === 'CAJA' ? sesionActivaId : null,
      }
    })

    const pagosConMetodo = pagosPayload.filter((p) => p.metodo_cobro_id)
    if (pagos.length > 0 && pagosConMetodo.length !== pagos.length) {
      toast.error('Todos los abonos deben tener un método de pago')
      return
    }

    const parsed = gastoSchema.safeParse({
      cuenta_id: cuentaId,
      proveedor_id: proveedorId || undefined,
      nro_control: nroControl.trim() || undefined,
      descripcion: descripcion.trim(),
      fecha,
      moneda_id: 'USD',
      moneda_factura: monedaFactura,
      usa_tasa_paralela: usaTasaParalela,
      tasa: tasaInternaNum,
      tasa_proveedor: usaTasaParalela ? parseFloat(tasaProveedor) || undefined : undefined,
      tipo_impuesto: tipoImpuesto,
      porcentaje_iva: tipoImpuesto === 'Gravable' ? parseFloat(porcentajeIva) || 0 : 0,
      monto_factura: parseFloat(montoFactura) || 0,
      monto_usd: montoContableUsd,
      pagos: pagosConMetodo,
      observaciones: observaciones.trim(),
    })

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos, revisa el formulario')
      return
    }

    setGuardando(true)
    try {
      const { nroGasto } = await crearGasto({
        cuenta_id: parsed.data.cuenta_id,
        proveedor_id: parsed.data.proveedor_id,
        nro_factura: nroFactura.trim() || undefined,
        nro_control: parsed.data.nro_control,
        descripcion: parsed.data.descripcion,
        fecha: parsed.data.fecha,
        moneda_id: 'USD',
        moneda_factura: parsed.data.moneda_factura,
        usa_tasa_paralela: parsed.data.usa_tasa_paralela,
        tasa: parsed.data.tasa,
        tasa_proveedor: parsed.data.tasa_proveedor,
        tipo_impuesto: parsed.data.tipo_impuesto,
        porcentaje_iva: parsed.data.porcentaje_iva,
        monto_factura: parsed.data.monto_factura,
        monto_usd: parsed.data.monto_usd ?? 0,
        pagos: (parsed.data.pagos as GastoPago[]).map((p) => ({
          ...p,
          sesion_caja_id: destinoCobro === 'CAJA' ? sesionActivaId : null,
        })),
        observaciones: parsed.data.observaciones || undefined,
        empresa_id: user.empresa_id,
        created_by: user.id,
      })
      toast.success(`Gasto ${nroGasto} registrado exitosamente`)
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
      {/* Dialog de borrador encontrado */}
      <Dialog open={mostrarRestaurar} onOpenChange={setMostrarRestaurar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrador encontrado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Hay un gasto sin finalizar. ¿Deseas continuar donde lo dejaste?
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

      {/* Layout fullscreen: indicador arriba, contenido scrolleable, footer fijo */}
      <div className="flex flex-col h-full relative">
        {/* Indicador de pasos — navegacion libre: solo el activo se ilumina,
            sin checks (opcion A del owner). Todos clickeables. */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <WizardStepIndicator
            steps={STEPS}
            currentStep={step}
            completedSteps={[]}
            onStepClick={handleStepClick}
            freeNavigation
          />
        </div>

        {/* Contenido del paso actual — scrolleable, swipe horizontal */}
        <div
          className="flex-1 overflow-y-auto px-4 pb-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {STEP_COMPONENTS[step - 1]}

          {/* Hint de swipe — atajo secundario, se oculta en el ultimo paso */}
          {step < 3 && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60 select-none">
              <ArrowLeft size={12} className="animate-pulse" />
              Deslizá o usá los botones para avanzar
              <ArrowRight size={12} className="animate-pulse" />
            </p>
          )}
        </div>

        {/* Footer fijo — 2 filas: navegacion primaria (Atras/Continuar) +
            fila de acciones (resumen, cancelar, registrar) */}
        <div className="shrink-0 border-t bg-background px-4 py-3 space-y-2.5">
          {/* Fila 1: navegacion primaria — botones grandes visibles.
              El swipe y los numeros del indicador son atajos secundarios. */}
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="h-11 rounded-xl gap-2 flex-1 text-base"
              onClick={() => irAPaso((step - 1) as 1 | 2 | 3)}
              disabled={step === 1}
            >
              <ArrowLeft size={18} />
              Atrás
            </Button>
            <Button
              className="h-11 rounded-xl gap-2 flex-1 text-base"
              onClick={() => irAPaso((step + 1) as 1 | 2 | 3)}
              disabled={step === 3}
            >
              Continuar
              <ArrowRight size={18} />
            </Button>
          </div>

          {/* Fila 2: acciones — resumen (izq) + cancelar + registrar (der) */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setResumenOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              aria-label={resumenOpen ? 'Cerrar resumen de abonos' : 'Ver resumen de abonos'}
            >
              {resumenOpen ? <CaretDown className="h-3.5 w-3.5" /> : <CaretUp className="h-3.5 w-3.5" />}
              {pagos.length > 0 ? `${pagos.length} abono(s)` : 'Resumen'}
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
              onClick={handleConfirmar}
              disabled={!canProcesar || guardando}
            >
              <CheckCircle size={16} />
              {guardando ? 'Registrando...' : 'Registrar'}
            </Button>
          </div>
        </div>

        {/* Panel de resumen de abonos — deslizable desde el borde inferior */}
        <PanelResumenAbonos
          open={resumenOpen}
          onClose={() => setResumenOpen(false)}
          lineas={acumuladorLineas}
          total={acumuladorTotal}
          emptyMessage="Aún no hay abonos registrados"
        />
      </div>
    </>
  )
}
