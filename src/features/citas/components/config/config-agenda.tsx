import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { CalendarDots, Warning } from '@phosphor-icons/react'
import { useQuery } from '@powersync/react'
import { useAgendaConfig, guardarAgendaConfig, type AgendaConfig } from '../../hooks/use-agenda-config'
import { useCurrentUser } from '@/core/hooks/use-current-user'

export function ConfigAgenda() {
  const { config, isLoading, empresaId } = useAgendaConfig()
  const { user } = useCurrentUser()
  const esPropietario = user?.level === 1

  const { data: citasPendientesData } = useQuery(
    empresaId
      ? "SELECT COUNT(*) as total FROM citas WHERE empresa_id = ? AND cita_status IN ('RESERVADA', 'EN_PROCESO')"
      : '',
    empresaId ? [empresaId] : []
  )
  const citasPendientes =
    ((citasPendientesData ?? [])[0] as { total: number } | undefined)?.total ?? 0

  const [showPendingAlert, setShowPendingAlert] = useState(false)

  const [mostrarAgenda, setMostrarAgenda] = useState(true)
  const [limiteDias, setLimiteDias] = useState(30)
  const [rangoGrilla, setRangoGrilla] = useState<AgendaConfig['rango_grilla_default']>('semana')
  const [duracionSlot, setDuracionSlot] = useState(30)
  const [solapar, setSolapar] = useState(false)
  const [sincronizado, setSincronizado] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!isLoading && !sincronizado) {
      setMostrarAgenda(config.mostrar_agenda)
      setLimiteDias(config.limite_futuro_dias)
      setRangoGrilla(config.rango_grilla_default)
      setDuracionSlot(config.duracion_slot_default)
      setSolapar(config.permitir_solapamiento_descanso)
      setSincronizado(true)
    }
  }, [isLoading, config, sincronizado])

  const handleToggleMostrarAgenda = (checked: boolean) => {
    if (!checked && citasPendientes > 0) {
      setShowPendingAlert(true)
      return
    }
    setMostrarAgenda(checked)
  }

  const handleConfirmarDesactivar = () => {
    setMostrarAgenda(false)
    setShowPendingAlert(false)
  }

  const handleGuardar = async () => {
    if (!empresaId) return
    setGuardando(true)
    try {
      await guardarAgendaConfig(empresaId, {
        mostrar_agenda: mostrarAgenda,
        limite_futuro_dias: limiteDias,
        rango_grilla_default: rangoGrilla,
        duracion_slot_default: duracionSlot,
        permitir_solapamiento_descanso: solapar,
      })
      toast.success('Configuracion de agenda guardada')
    } catch (e) {
      console.error('[ConfigAgenda] Error al guardar:', e)
      toast.error('Error al guardar configuracion')
    } finally {
      setGuardando(false)
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Cargando...</p>
  }

  return (
    <div className="space-y-6 max-w-sm">
      {/* Visibilidad del modulo */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Visibilidad del modulo</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Activa o desactiva la seccion "Agenda y Citas" en el menu lateral.
          </p>
        </div>
        <label className={`flex items-center gap-3 ${esPropietario ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
          <input
            type="checkbox"
            checked={mostrarAgenda}
            onChange={(e) => handleToggleMostrarAgenda(e.target.checked)}
            disabled={!esPropietario}
            className="w-4 h-4 rounded accent-primary disabled:cursor-not-allowed"
          />
          <span className="text-sm">Mostrar modulo de Agenda y Citas</span>
        </label>
        {!esPropietario && (
          <p className="text-xs text-muted-foreground">
            Solo el Propietario puede activar o desactivar este modulo.
          </p>
        )}

        {showPendingAlert && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Warning size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                Hay <strong>{citasPendientes}</strong> cita{citasPendientes !== 1 ? 's' : ''} activa{citasPendientes !== 1 ? 's' : ''} (reservadas o en proceso).
                Si desactivas el modulo no podras gestionarlas desde la agenda.
                ¿Confirmas que deseas desactivarlo?
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                onClick={handleConfirmarDesactivar}
              >
                Desactivar de todas formas
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setShowPendingAlert(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Limite de dias futuros */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Limite de programacion futura</p>
        <p className="text-xs text-muted-foreground">
          Cuantos dias hacia el futuro se pueden agendar citas (0 = sin limite).
        </p>
        <select
          value={limiteDias}
          onChange={(e) => setLimiteDias(parseInt(e.target.value))}
          className="h-9 w-52 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value={7}>7 dias (1 semana)</option>
          <option value={15}>15 dias (2 semanas)</option>
          <option value={30}>30 dias (1 mes)</option>
          <option value={90}>90 dias (3 meses)</option>
          <option value={0}>Sin limite</option>
        </select>
      </div>

      {/* Vista por defecto del calendario */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Vista por defecto del calendario</p>
        <p className="text-xs text-muted-foreground">
          Vista que se muestra al abrir el calendario.
        </p>
        <select
          value={rangoGrilla}
          onChange={(e) => setRangoGrilla(e.target.value as AgendaConfig['rango_grilla_default'])}
          className="h-9 w-52 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="dia">Vista de dia</option>
          <option value="semana">Vista de semana</option>
          <option value="mes">Vista de mes</option>
        </select>
      </div>

      {/* Duracion del slot */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Duracion minima del slot</p>
        <p className="text-xs text-muted-foreground">
          Intervalo de tiempo en la grilla del calendario.
        </p>
        <select
          value={duracionSlot}
          onChange={(e) => setDuracionSlot(parseInt(e.target.value))}
          className="h-9 w-52 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value={15}>15 minutos</option>
          <option value={30}>30 minutos</option>
          <option value={45}>45 minutos</option>
          <option value={60}>60 minutos</option>
        </select>
      </div>

      {/* Solapamiento con descansos */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Citas durante descansos</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Permitir agendar citas en el horario de descanso del staff.
          </p>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={solapar}
            onChange={(e) => setSolapar(e.target.checked)}
            className="w-4 h-4 rounded accent-primary"
          />
          <span className="text-sm">Permitir solapamiento con descansos</span>
        </label>
      </div>

      <Button onClick={handleGuardar} disabled={guardando} size="sm" className="gap-2">
        <CalendarDots size={14} />
        {guardando ? 'Guardando...' : 'Guardar configuracion'}
      </Button>
    </div>
  )
}
