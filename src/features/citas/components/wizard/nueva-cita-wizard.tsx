import { useState, useEffect } from 'react'
import { useCitaWizardStore } from '@/stores/cita-wizard-store'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { StepServicios } from './step-servicios'
import { StepPrioridad } from './step-prioridad'
import { StepFechaStaff } from './step-fecha-staff'
import { StepCheckout } from './step-checkout'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { crearCita, actualizarGoogleEventId } from '../../hooks/use-citas'
import { sincronizarCitaGoogle } from '../../hooks/use-google-calendar'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { CheckCircle, ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { useQuery } from '@powersync/react'

const STEPS = [
  { label: 'Servicios',        short: 'Servicios' },
  { label: 'Prioridad',        short: 'Prioridad' },
  { label: 'Fecha y Horario',  short: 'Horario' },
  { label: 'Confirmar',        short: 'Confirmar' },
]

export function NuevaCitaWizard() {
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [guardando, setGuardando] = useState(false)
  const [mostrarRestaurar, setMostrarRestaurar] = useState(false)

  const {
    step, setStep,
    clienteId,
    clienteNombre,
    servicios,
    prioridadFiltro,
    profesionalFavorito,
    fecha,
    horaInicio,
    horaFin,
    asignacionPersonal,
    checkoutTipo,
    pago,
    observaciones,
    totalUsd,
    duracionTotalMin,
    profesionalId,
    restaurarDraft,
    reset,
    sheetOpen,
    closeSheet,
  } = useCitaWizardStore()

  // Detectar sesion huerfana al montar
  useEffect(() => {
    const hayDraft = restaurarDraft()
    if (hayDraft) {
      setMostrarRestaurar(true)
    }
  }, [])

  // Obtener tasa actual
  const { data: tasaData } = useQuery(
    empresaId
      ? 'SELECT valor FROM tasas_cambio WHERE empresa_id = ? ORDER BY created_at DESC LIMIT 1'
      : '',
    empresaId ? [empresaId] : []
  )
  const tasa = (tasaData?.[0] as { valor: string } | undefined)?.valor ?? '1'

  const canGoNext = (): boolean => {
    if (step === 1) return !!clienteId && servicios.length > 0
    if (step === 2) {
      if (!prioridadFiltro) return false
      if (prioridadFiltro === 'EMPLEADO') return !!profesionalFavorito
      return true
    }
    if (step === 3) return !!fecha && !!horaInicio && !!horaFin
    if (step === 4) return true
    return false
  }

  const goNext = () => {
    if (step < 4) setStep((step + 1) as 1 | 2 | 3 | 4)
  }

  const goBack = () => {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3 | 4)
    else if (sheetOpen) { reset(); closeSheet() }
    else navigate({ to: '/citas/calendario' as any })
  }

  const handleConfirmar = async () => {
    if (!clienteId || !fecha || !horaInicio || servicios.length === 0) {
      toast.error('Completa todos los pasos antes de confirmar')
      return
    }

    const profId = profesionalId()
    if (!profId) {
      toast.error('Asigna al menos un profesional a la cita')
      return
    }

    setGuardando(true)
    try {
      const fechaInicio = new Date(`${fecha}T${horaInicio}:00`).toISOString()
      const fechaFin = new Date(`${fecha}T${horaFin}:00`).toISOString()
      const duracion = duracionTotalMin()
      const store = useCitaWizardStore.getState()

      const citaId = await crearCita({
        clienteId,
        profesionalId: profId,
        fechaInicio,
        fechaFin,
        duracionMin: duracion,
        servicios: servicios.map((s) => ({ ...s })),
        checkoutTipo,
        totalUsd: totalUsd(),
        tasa,
        notas: undefined,
        observaciones: observaciones || undefined,
        prioridadFiltro: prioridadFiltro ?? undefined,
        ejecucionParalela: store.ejecucionParalela,
        asignacionPersonal,
        empresaId,
        userId: user?.id ?? '',
        pagoData: pago ?? undefined,
      })

      toast.success('Cita agendada correctamente')

      // Sincronizar con Google Calendar (best-effort)
      void sincronizarCitaGoogle({
        action: 'create',
        profesional_id: profId,
        cita: {
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          cliente_nombre: clienteNombre,
          servicios: servicios.map((s) => s.nombre),
        },
      }).then((result) => {
        if (result?.google_event_id) {
          void actualizarGoogleEventId(citaId, result.google_event_id)
        }
      })

      reset()
      if (sheetOpen) {
        closeSheet()
      } else {
        navigate({ to: '/citas/calendario' as any })
      }
    } catch (err) {
      console.error(err)
      const mensaje = err instanceof Error ? err.message : 'Error al agendar la cita'
      toast.error(mensaje)
    } finally {
      setGuardando(false)
    }
  }

  const STEP_COMPONENTS = [
    <StepServicios key="1" />,
    <StepPrioridad key="2" />,
    <StepFechaStaff key="3" />,
    <StepCheckout key="4" />,
  ]

  return (
    <>
      {/* Dialogo de sesion huerfana */}
      <Dialog open={mostrarRestaurar} onOpenChange={setMostrarRestaurar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrador encontrado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Hay un borrador de cita sin finalizar. ¿Deseas continuar donde lo dejaste?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset()
                setMostrarRestaurar(false)
              }}
            >
              Descartar
            </Button>
            <Button
              onClick={() => setMostrarRestaurar(false)}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-xl mx-auto flex flex-col gap-6">
        {/* Indicador de pasos */}
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => {
            const num = i + 1
            const done = step > num
            const active = step === num
            return (
              <div key={num} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => done && setStep(num as 1 | 2 | 3 | 4)}
                  className={cn(
                    'flex items-center gap-2 shrink-0 transition-all',
                    done ? 'cursor-pointer' : 'cursor-default'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all',
                      done
                        ? 'bg-primary border-primary text-primary-foreground'
                        : active
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-border text-muted-foreground bg-background'
                    )}
                  >
                    {done ? <CheckCircle size={16} weight="fill" /> : num}
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium hidden sm:block',
                      active ? 'text-primary' : done ? 'text-primary/70' : 'text-muted-foreground'
                    )}
                  >
                    {s.short}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-2 transition-all',
                      step > num ? 'bg-primary' : 'bg-border'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Titulo del paso actual */}
        <div>
          <h2 className="text-lg font-semibold">{STEPS[step - 1].label}</h2>
          <p className="text-sm text-muted-foreground">
            Paso {step} de {STEPS.length}
          </p>
        </div>

        {/* Contenido del paso */}
        <div className="flex-1">{STEP_COMPONENTS[step - 1]}</div>

        {/* Navegacion */}
        <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t flex gap-3 mt-2">
          <Button variant="outline" onClick={goBack} className="gap-2">
            <ArrowLeft size={16} />
            {step === 1 ? 'Cancelar' : 'Atras'}
          </Button>
          <div className="flex-1" />
          {step < 4 ? (
            <Button
              onClick={goNext}
              disabled={!canGoNext()}
              className="gap-2 bg-foreground text-background hover:bg-foreground/85"
            >
              Continuar
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              onClick={handleConfirmar}
              disabled={guardando}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle size={16} />
              {guardando ? 'Guardando...' : 'Guardar Cita'}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
