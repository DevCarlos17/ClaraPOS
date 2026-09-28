import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, CheckCircle, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { WizardStepIndicator } from '@/components/shared/wizard-step-indicator'
import { WizardAcumulador } from '@/components/shared/wizard-acumulador'
import { useGastoWizardStore } from '@/stores/gasto-wizard-store'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCuentasDetallePorTipo } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useProveedores } from '@/features/proveedores/hooks/use-proveedores'
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
 * Resumen de confirmacion — version compacta del `ResumenConfirm` de
 * `gasto-form.tsx`, adaptada al espacio reducido del BottomSheet mobile.
 * Componente local, no exportado (mismo patron que `gasto-form.tsx`).
 */
function ResumenGasto({
  cuentaNombre,
  proveedorNombre,
  descripcion,
  fecha,
  monedaFactura,
  totalFacturaNum,
  montoContableUsd,
  pagosCount,
  saldoPendienteProveedor,
}: {
  cuentaNombre: string
  proveedorNombre: string | null
  descripcion: string
  fecha: string
  monedaFactura: 'USD' | 'BS'
  totalFacturaNum: number
  montoContableUsd: number | null
  pagosCount: number
  saldoPendienteProveedor: number
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">Resumen del Gasto</h3>
        <p className="text-xs text-muted-foreground">Verifica los datos antes de confirmar</p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm shadow-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cuenta:</span>
          <span className="font-semibold text-foreground text-right max-w-[220px] truncate">{cuentaNombre}</span>
        </div>
        {proveedorNombre && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Proveedor:</span>
            <span className="font-semibold text-foreground">{proveedorNombre}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Fecha:</span>
          <span className="font-mono text-foreground">{fecha}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Descripción:</span>
          <span className="text-foreground text-right max-w-[220px]">{descripcion}</span>
        </div>
        <div className="border-t border-border pt-2 mt-1">
          <div className="flex justify-between font-semibold">
            <span className="text-foreground">Total Factura:</span>
            <span className="text-foreground">
              {totalFacturaNum.toFixed(2)} {monedaFactura}
            </span>
          </div>
          {montoContableUsd !== null && (
            <div className="flex justify-between text-muted-foreground text-xs mt-0.5">
              <span>Total Contable USD:</span>
              <span>{formatUsd(montoContableUsd)}</span>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {pagosCount > 0 ? `${pagosCount} abono(s) registrado(s)` : 'Sin abonos — se registra a crédito'}
      </p>

      {saldoPendienteProveedor > 0.005 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
          <Warning className="h-3.5 w-3.5 shrink-0" />
          Saldo pendiente: {formatUsd(saldoPendienteProveedor)} — quedará en Cuentas por Pagar
        </div>
      )}
    </div>
  )
}

/**
 * Orquestador del wizard de gasto — `WizardStepIndicator` + `WizardAcumulador`
 * + routing 1→2→3 + resumen de confirmacion + submit (`crearGasto`, MISMA
 * mutacion que `gasto-form.tsx`). Sin props: consume `useGastoWizardStore()`
 * (Zustand global) para todo el estado, incluida la recuperacion de
 * borrador y el submit final.
 */
export function GastoWizard() {
  const { user } = useCurrentUser()
  const [guardando, setGuardando] = useState(false)
  const [mostrarRestaurar, setMostrarRestaurar] = useState(false)
  const [mostrarResumen, setMostrarResumen] = useState(false)

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
  } = useGastoWizardStore()

  const { cuentas } = useCuentasDetallePorTipo('GASTO')
  const { proveedores } = useProveedores()
  const { metodos } = useMetodosCxP()

  // Detectar borrador huerfano al montar (mismo patron que nueva-cita-wizard.tsx)
  useEffect(() => {
    const hayDraft = hidratarDesdeBorrador()
    if (hayDraft) setMostrarRestaurar(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-guardado del borrador mientras se completa el wizard
  useEffect(() => {
    if (!user?.empresa_id) return
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
    totalFacturaNum,
    montoContableUsd,
    abonoPagoProveedorUsd,
    abonoPagoInternoUsd,
    saldoPendienteProveedor,
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

  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaId)
  const proveedorSeleccionado = proveedores.find((p) => p.id === proveedorId)
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

  const STEP_COMPONENTS = [<PasoIdentificacion key="1" />, <PasoMonto key="2" />, <PasoPagos key="3" />]

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
          emptyMessage="Aún no hay abonos registrados"
        />

        <div className="flex-1">
          {mostrarResumen ? (
            <ResumenGasto
              cuentaNombre={
                cuentaSeleccionada ? `${cuentaSeleccionada.codigo} - ${cuentaSeleccionada.nombre}` : cuentaId
              }
              proveedorNombre={proveedorSeleccionado?.razon_social ?? null}
              descripcion={descripcion.trim()}
              fecha={fecha}
              monedaFactura={monedaFactura}
              totalFacturaNum={totalFacturaNum}
              montoContableUsd={montoContableUsd}
              pagosCount={pagos.length}
              saldoPendienteProveedor={saldoPendienteProveedor}
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
              disabled={guardando}
            >
              <CheckCircle size={16} />
              {guardando ? 'Registrando...' : 'Registrar gasto'}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
