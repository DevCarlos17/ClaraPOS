import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { reprogramarCita, reprogramarCitaConProfesional, type Cita } from '../../hooks/use-citas'
import { registrarCitaLog } from '../../hooks/use-cita-log'
import { sincronizarCitaGoogle } from '../../hooks/use-google-calendar'
import { SlotsProfesional } from '../wizard/step-fecha-staff'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useAgendaConfig } from '../../hooks/use-agenda-config'
import { useQuery } from '@powersync/react'
import { toast } from 'sonner'
import { format, addDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowsClockwise, CaretLeft, CaretRight, ClockClockwise } from '@phosphor-icons/react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { todayStr } from '@/lib/dates'

type Modo = 'mismo' | 'otro' | 'fuera_horario'

interface ReprogramarModalProps {
  cita: Cita
  clienteNombre: string
  profesionalNombre: string
  open: boolean
  onClose: () => void
  onReprogramado: () => void
  /** Fecha pre-cargada en formato yyyy-MM-dd (ej. desde drag en vista mes) */
  fechaInicial?: string
}

function calcOffsetDesdeFecha(fechaStr: string): number {
  if (!fechaStr) return 0
  const hoy = new Date()
  const inicioHoy = startOfWeek(hoy, { weekStartsOn: 1 })
  const fechaDate = new Date(fechaStr + 'T12:00:00')
  const inicioFecha = startOfWeek(fechaDate, { weekStartsOn: 1 })
  const diffMs = inicioFecha.getTime() - inicioHoy.getTime()
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
}

export function ReprogramarModal({
  cita,
  clienteNombre,
  profesionalNombre,
  open,
  onClose,
  onReprogramado,
  fechaInicial,
}: ReprogramarModalProps) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { config } = useAgendaConfig()

  const [guardando, setGuardando] = useState(false)
  const [modo, setModo] = useState<Modo>('mismo')
  const [semanaOffset, setSemanaOffset] = useState(() => calcOffsetDesdeFecha(fechaInicial ?? ''))
  const [fecha, setFecha] = useState(fechaInicial ?? '')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [profesionalSeleccionado, setProfesionalSeleccionado] = useState('')
  const [motivo, setMotivo] = useState('')
  const [showPinFueraHorario, setShowPinFueraHorario] = useState(false)
  const [supervisorIdFueraHorario, setSupervisorIdFueraHorario] = useState('')

  // Otros profesionales con horario activo (excluye al profesional actual)
  const { data: profesionalesData } = useQuery(
    empresaId
      ? `SELECT u.id, u.nombre FROM usuarios u
         INNER JOIN horarios_staff h ON h.usuario_id = u.id AND h.empresa_id = u.empresa_id AND h.is_active = 1
         WHERE u.empresa_id = ? AND u.is_active = 1 AND u.id != ?
         GROUP BY u.id, u.nombre
         ORDER BY u.nombre`
      : '',
    empresaId ? [empresaId, cita.profesional_id] : []
  )
  const otrosProfesionales = (profesionalesData ?? []) as { id: string; nombre: string }[]

  // Para modo fuera de horario: TODOS los profesionales activos (sin filtro de horario)
  const { data: todosProfsData } = useQuery(
    empresaId
      ? 'SELECT id, nombre FROM usuarios WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre'
      : '',
    empresaId ? [empresaId] : []
  )
  const todosProfesionales = (todosProfsData ?? []) as { id: string; nombre: string }[]

  const hoy = new Date()
  const inicioSemana = startOfWeek(addDays(hoy, semanaOffset * 7), { weekStartsOn: 1 })
  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i))

  const maxFutureDate =
    config.limite_futuro_dias > 0
      ? new Date(hoy.getTime() + config.limite_futuro_dias * 24 * 60 * 60 * 1000)
      : null

  const profesionalActivo =
    modo === 'mismo'
      ? cita.profesional_id
      : profesionalSeleccionado

  const calcularHoraFin = (inicio: string, durMin: number): string => {
    const [h, m] = inicio.split(':').map(Number)
    const totalMin = h * 60 + m + durMin
    const fh = Math.floor(totalMin / 60) % 24
    const fm = totalMin % 60
    return `${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`
  }

  const handleHoraInicioFueraHorario = (v: string) => {
    setHoraInicio(v)
    if (v) setHoraFin(calcularHoraFin(v, cita.duracion_min))
    else setHoraFin('')
  }

  const resetSlot = () => {
    setFecha('')
    setHoraInicio('')
    setHoraFin('')
  }

  const handleModoChange = (m: Modo) => {
    if (m === 'fuera_horario') {
      // Requiere PIN de supervisor antes de activar el modo
      setShowPinFueraHorario(true)
      return
    }
    setModo(m)
    setProfesionalSeleccionado('')
    setSupervisorIdFueraHorario('')
    resetSlot()
  }

  const handlePinFueraHorarioAutorizado = (supervisorId: string) => {
    setShowPinFueraHorario(false)
    setSupervisorIdFueraHorario(supervisorId)
    setModo('fuera_horario')
    setProfesionalSeleccionado('')
    resetSlot()
  }

  const handleSeleccionarFecha = (d: Date) => {
    setFecha(format(d, 'yyyy-MM-dd'))
    setHoraInicio('')
    setHoraFin('')
  }

  const handleSlotSelect = (inicio: string, fin: string) => {
    setHoraInicio(inicio)
    setHoraFin(fin)
  }

  const handleConfirmar = async () => {
    if (!fecha || !horaInicio || !horaFin) return
    setGuardando(true)
    try {
      const nuevaFechaInicio = new Date(`${fecha}T${horaInicio}:00`).toISOString()
      const nuevaFechaFin = new Date(`${fecha}T${horaFin}:00`).toISOString()
      const esFueraHorario = modo === 'fuera_horario'
      const profesionalDestino = modo === 'mismo' ? cita.profesional_id : profesionalSeleccionado

      if (modo === 'mismo') {
        await reprogramarCita(cita.id, nuevaFechaInicio, nuevaFechaFin, user?.id ?? '', {
          skipOverlapCheck: false,
        })
      } else {
        // 'otro' y 'fuera_horario' cambian profesional; fuera_horario salta validacion de slots
        await reprogramarCitaConProfesional(
          cita.id,
          nuevaFechaInicio,
          nuevaFechaFin,
          profesionalSeleccionado,
          user?.id ?? '',
          // fuera de horario: saltamos el check de solapamiento (lo autorizó el supervisor)
          { skipOverlapCheck: esFueraHorario }
        )
      }

      const allProfs = [...otrosProfesionales, ...todosProfesionales]
      const profesionalFinalNombre =
        modo === 'mismo'
          ? profesionalNombre
          : (allProfs.find((p) => p.id === profesionalSeleccionado)?.nombre ?? '')

      await registrarCitaLog({
        empresaId: cita.empresa_id,
        citaId: cita.id,
        usuarioId: user?.id ?? '',
        accion: 'REPROGRAMADA',
        datosAnteriores: {
          fecha_inicio: cita.fecha_inicio,
          fecha_fin: cita.fecha_fin,
          profesional_id: cita.profesional_id,
        },
        datosNuevos: {
          fecha_inicio: nuevaFechaInicio,
          fecha_fin: nuevaFechaFin,
          metodo: esFueraHorario ? 'fuera_horario' : 'modal',
          ...(modo !== 'mismo' && { profesional_id: profesionalDestino }),
          ...(modo !== 'mismo' && profesionalFinalNombre && { profesional_nombre: profesionalFinalNombre }),
          ...(esFueraHorario && supervisorIdFueraHorario && { autorizado_por: supervisorIdFueraHorario }),
          ...(motivo.trim() && { motivo: motivo.trim() }),
        },
      })

      void sincronizarCitaGoogle({
        action: 'update',
        profesional_id: profesionalDestino,
        cita: {
          fecha_inicio: nuevaFechaInicio,
          fecha_fin: nuevaFechaFin,
          cliente_nombre: clienteNombre,
          status: cita.cita_status,
          google_event_id: cita.google_event_id,
        },
      })

      toast.success(
        modo === 'otro' || modo === 'fuera_horario'
          ? `Cita reprogramada con ${profesionalFinalNombre}`
          : 'Cita reprogramada'
      )
      onReprogramado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al reprogramar cita')
    } finally {
      setGuardando(false)
    }
  }

  const puedeConfirmar =
    fecha !== '' &&
    horaInicio !== '' &&
    horaFin !== '' &&
    (modo === 'mismo' || profesionalSeleccionado !== '')

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowsClockwise size={18} className="text-primary" />
            Reprogramar Cita
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info actual */}
          <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
            <p className="font-medium">{clienteNombre}</p>
            <p className="text-muted-foreground text-xs">
              Profesional actual: {profesionalNombre}
            </p>
            <p className="text-muted-foreground text-xs">
              {format(new Date(cita.fecha_inicio), "EEE d 'de' MMM 'a las' HH:mm", {
                locale: es,
              })}{' '}
              ({cita.duracion_min} min)
            </p>
          </div>

          {/* Toggle de modo */}
          <div className="flex rounded-lg border border-border overflow-hidden divide-x divide-border text-[11px]">
            {(['mismo', 'otro', 'fuera_horario'] as Modo[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModoChange(m)}
                className={cn(
                  'flex-1 px-2 py-2 font-semibold uppercase tracking-wide transition-colors flex items-center justify-center gap-1',
                  modo === m
                    ? m === 'fuera_horario'
                      ? 'bg-amber-500 text-white'
                      : 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {m === 'mismo' && 'Mismo prof.'}
                {m === 'otro' && 'Otro prof.'}
                {m === 'fuera_horario' && (
                  <>
                    <ClockClockwise size={11} />
                    Fuera horario
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Selector de profesional (solo modo "otro") */}
          {modo === 'otro' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Profesional</label>
              {otrosProfesionales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3 border rounded-lg">
                  No hay otros profesionales con horario activo
                </p>
              ) : (
                <Select
                  value={profesionalSeleccionado}
                  onValueChange={(v) => {
                    setProfesionalSeleccionado(v)
                    resetSlot()
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar profesional..." />
                  </SelectTrigger>
                  <SelectContent>
                    {otrosProfesionales.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Selector de profesional para modo "fuera de horario" */}
          {modo === 'fuera_horario' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <ClockClockwise size={13} />
                Modo fuera de horario — autorizado por supervisor
              </div>
              <label className="text-sm font-medium">Profesional</label>
              {todosProfesionales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3 border rounded-lg">
                  No hay profesionales activos
                </p>
              ) : (
                <Select
                  value={profesionalSeleccionado}
                  onValueChange={(v) => {
                    setProfesionalSeleccionado(v)
                    resetSlot()
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar profesional..." />
                  </SelectTrigger>
                  <SelectContent>
                    {todosProfesionales.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Picker de fecha + slots (visible cuando hay profesional activo) */}
          {(modo === 'mismo' || profesionalSeleccionado !== '') && (
            <>
              {/* Selector de semana */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Fecha</label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setSemanaOffset((p) => p - 1)}
                    >
                      <CaretLeft size={14} />
                    </Button>
                    <span className="text-xs text-muted-foreground px-1 min-w-[80px] text-center">
                      {format(inicioSemana, 'MMM yyyy', { locale: es })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setSemanaOffset((p) => p + 1)}
                    >
                      <CaretRight size={14} />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {dias.map((d) => {
                    const dStr = format(d, 'yyyy-MM-dd')
                    const esHoy = dStr === todayStr()
                    const seleccionado = dStr === fecha
                    const esPasado = d < new Date(new Date().setHours(0, 0, 0, 0))
                    const esFuturoLimitado = maxFutureDate !== null && d >= maxFutureDate
                    const bloqueado = esPasado || esFuturoLimitado
                    return (
                      <button
                        key={dStr}
                        onClick={() => !bloqueado && handleSeleccionarFecha(d)}
                        disabled={bloqueado}
                        className={cn(
                          'flex flex-col items-center py-2 rounded-xl text-sm transition-all',
                          seleccionado
                            ? 'bg-primary text-primary-foreground'
                            : esHoy
                            ? 'border border-primary text-primary'
                            : bloqueado
                            ? 'opacity-30 cursor-not-allowed'
                            : 'hover:bg-muted'
                        )}
                      >
                        <span className="text-[10px] uppercase">
                          {format(d, 'EEE', { locale: es })}
                        </span>
                        <span className="font-semibold">{format(d, 'd')}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Slots del profesional para el día seleccionado */}
              {fecha && profesionalActivo && modo !== 'fuera_horario' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Horario disponible ({cita.duracion_min} min)
                  </label>
                  <SlotsProfesional
                    profesionalId={profesionalActivo}
                    fecha={fecha}
                    duracionMin={cita.duracion_min}
                    horaInicio={horaInicio}
                    onSeleccionar={handleSlotSelect}
                    empresaId={empresaId}
                    userId={user?.id ?? ''}
                  />
                </div>
              )}

              {/* Selector de hora manual para modo fuera de horario */}
              {fecha && modo === 'fuera_horario' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Hora de inicio ({cita.duracion_min} min)
                  </label>
                  <input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => handleHoraInicioFueraHorario(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  {horaInicio && horaFin && (
                    <p className="text-xs text-muted-foreground">
                      Fin estimado: <span className="font-medium">{horaFin}</span>
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Resumen de la nueva fecha */}
          {fecha && horaInicio && (
            <div className="text-sm text-center p-3 bg-primary/5 rounded-xl border border-primary/20 text-primary font-medium">
              {format(new Date(`${fecha}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })} —{' '}
              {horaInicio} a {horaFin}
              {modo === 'otro' && profesionalSeleccionado && (
                <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                  con{' '}
                  {otrosProfesionales.find((p) => p.id === profesionalSeleccionado)?.nombre}
                </span>
              )}
            </div>
          )}

          {/* Motivo de la reprogramación (opcional) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Motivo <span className="font-normal">(opcional)</span>
            </label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo de la reprogramación (opcional)"
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmar}
              disabled={guardando || !puedeConfirmar}
              className="flex-1"
            >
              {guardando ? 'Guardando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <SupervisorPinDialog
      isOpen={showPinFueraHorario}
      onClose={() => setShowPinFueraHorario(false)}
      onAuthorized={handlePinFueraHorarioAutorizado}
      titulo="Agendar fuera de horario"
      mensaje="Se requiere autorización de supervisor para programar una cita fuera del horario establecido."
      requiredPermission="citas.gestionar"
    />
    </>
  )
}
