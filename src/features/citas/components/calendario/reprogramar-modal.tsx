import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { reprogramarCita, reprogramarCitaConProfesional, type Cita } from '../../hooks/use-citas'
import { registrarCitaLog } from '../../hooks/use-cita-log'
import { sincronizarCitaGoogle } from '../../hooks/use-google-calendar'
import { SlotsProfesional } from '../wizard/step-fecha-staff'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useQuery } from '@powersync/react'
import { toast } from 'sonner'
import { format, addDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowsClockwise, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { todayStr } from '@/lib/dates'

type Modo = 'mismo' | 'otro'

interface ReprogramarModalProps {
  cita: Cita
  clienteNombre: string
  profesionalNombre: string
  open: boolean
  onClose: () => void
  onReprogramado: () => void
}

export function ReprogramarModal({
  cita,
  clienteNombre,
  profesionalNombre,
  open,
  onClose,
  onReprogramado,
}: ReprogramarModalProps) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const [guardando, setGuardando] = useState(false)
  const [modo, setModo] = useState<Modo>('mismo')
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [fecha, setFecha] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [profesionalSeleccionado, setProfesionalSeleccionado] = useState('')

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

  const hoy = new Date()
  const inicioSemana = startOfWeek(addDays(hoy, semanaOffset * 7), { weekStartsOn: 1 })
  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i))

  const profesionalActivo = modo === 'mismo' ? cita.profesional_id : profesionalSeleccionado

  const resetSlot = () => {
    setFecha('')
    setHoraInicio('')
    setHoraFin('')
  }

  const handleModoChange = (m: Modo) => {
    setModo(m)
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

      if (modo === 'mismo') {
        await reprogramarCita(cita.id, nuevaFechaInicio, nuevaFechaFin, user?.id ?? '')
      } else {
        await reprogramarCitaConProfesional(
          cita.id,
          nuevaFechaInicio,
          nuevaFechaFin,
          profesionalSeleccionado,
          user?.id ?? ''
        )
      }

      const profesionalFinalNombre =
        modo === 'mismo'
          ? profesionalNombre
          : (otrosProfesionales.find((p) => p.id === profesionalSeleccionado)?.nombre ?? '')

      await registrarCitaLog({
        empresaId: cita.empresa_id,
        citaId: cita.id,
        usuarioId: user?.id ?? '',
        accion: 'MODAL_REPROGRAMAR',
        datosAnteriores: {
          fecha_inicio: cita.fecha_inicio,
          fecha_fin: cita.fecha_fin,
          profesional_id: cita.profesional_id,
        },
        datosNuevos: {
          fecha_inicio: nuevaFechaInicio,
          fecha_fin: nuevaFechaFin,
          ...(modo === 'otro' && { profesional_id: profesionalSeleccionado }),
        },
      })

      void sincronizarCitaGoogle({
        action: 'update',
        profesional_id: modo === 'mismo' ? cita.profesional_id : profesionalSeleccionado,
        cita: {
          fecha_inicio: nuevaFechaInicio,
          fecha_fin: nuevaFechaFin,
          cliente_nombre: clienteNombre,
          status: cita.cita_status,
          google_event_id: cita.google_event_id,
        },
      })

      toast.success(
        modo === 'otro'
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
            {(['mismo', 'otro'] as Modo[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModoChange(m)}
                className={cn(
                  'flex-1 px-3 py-2 font-semibold uppercase tracking-wide transition-colors',
                  modo === m
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {m === 'mismo' ? 'Mismo profesional' : 'Otro profesional'}
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
                    return (
                      <button
                        key={dStr}
                        onClick={() => !esPasado && handleSeleccionarFecha(d)}
                        disabled={esPasado}
                        className={cn(
                          'flex flex-col items-center py-2 rounded-xl text-sm transition-all',
                          seleccionado
                            ? 'bg-primary text-primary-foreground'
                            : esHoy
                            ? 'border border-primary text-primary'
                            : esPasado
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
              {fecha && profesionalActivo && (
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
  )
}
