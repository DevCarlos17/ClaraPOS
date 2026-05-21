import { useState, useEffect } from 'react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCitaWizardStore, type AsignacionPersonal } from '@/stores/cita-wizard-store'
import { useCitasPorProfesional } from '../../hooks/use-citas'
import { useSlotsDisponibles } from '../../hooks/use-horarios-staff'
import { obtenerBusyTimesGoogle } from '../../hooks/use-google-calendar'
import { cn } from '@/lib/utils'
import { format, addDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { CaretLeft, CaretRight, GoogleLogo, Users } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { todayStr } from '@/lib/dates'

// Componente de slots para un profesional especifico
function SlotsProfesional({
  profesionalId,
  fecha,
  duracionMin,
  horaInicio,
  onSeleccionar,
}: {
  profesionalId: string
  fecha: string
  duracionMin: number
  horaInicio: string
  onSeleccionar: (inicio: string, fin: string) => void
}) {
  const { citas } = useCitasPorProfesional(profesionalId)
  const [googleBusy, setGoogleBusy] = useState<{ start: string; end: string }[]>([])
  const slots = useSlotsDisponibles(profesionalId, fecha, citas, duracionMin)

  useEffect(() => {
    if (!profesionalId || !fecha) { setGoogleBusy([]); return }
    const timeMin = `${fecha}T00:00:00Z`
    const timeMax = `${fecha}T23:59:59Z`
    obtenerBusyTimesGoogle(profesionalId, timeMin, timeMax).then(setGoogleBusy)
  }, [profesionalId, fecha])

  const isBlockedByGoogle = (hIni: string, hFin: string): boolean => {
    if (!fecha || googleBusy.length === 0) return false
    const start = new Date(`${fecha}T${hIni}`)
    const end = new Date(`${fecha}T${hFin}`)
    return googleBusy.some((busy) => {
      const bStart = new Date(busy.start)
      const bEnd = new Date(busy.end)
      return start < bEnd && end > bStart
    })
  }

  const ahora = new Date()
  const esPasado = (horaIni: string): boolean => {
    if (fecha !== todayStr()) return false
    const [h, m] = horaIni.split(':').map(Number)
    const slotTime = new Date(ahora)
    slotTime.setHours(h, m, 0, 0)
    return slotTime < ahora
  }

  if (!fecha) return null

  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4 border rounded-xl">
        Sin disponibilidad para este dia
      </p>
    )
  }

  return (
    <>
      {googleBusy.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <GoogleLogo size={12} weight="fill" className="text-[#4285F4]" />
          Los horarios bloqueados incluyen Google Calendar
        </div>
      )}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-48 overflow-y-auto pr-1">
        {slots.map((slot) => {
          const seleccionado = slot.horaInicio === horaInicio
          const bloqueadoGoogle = slot.disponible && isBlockedByGoogle(slot.horaInicio, slot.horaFin)
          const disponible = slot.disponible && !bloqueadoGoogle && !esPasado(slot.horaInicio)
          return (
            <button
              key={slot.horaInicio}
              onClick={() => disponible && onSeleccionar(slot.horaInicio, slot.horaFin)}
              disabled={!disponible}
              title={bloqueadoGoogle ? 'Ocupado en Google Calendar' : undefined}
              className={cn(
                'px-2 py-2 rounded-lg border text-xs font-medium transition-all text-center',
                seleccionado
                  ? 'bg-primary text-primary-foreground border-primary'
                  : disponible
                  ? 'border-border hover:border-primary/60 hover:bg-primary/5'
                  : 'border-border bg-muted text-muted-foreground/50 cursor-not-allowed line-through'
              )}
            >
              {slot.horaInicio}
            </button>
          )
        })}
      </div>
    </>
  )
}

// Componente para slots de TODOS los profesionales (prioridad horaria)
function SlotsHoraPrioridad({
  fecha,
  duracionMin,
  horaInicio,
  onSeleccionar,
  profesionales,
}: {
  fecha: string
  duracionMin: number
  horaInicio: string
  onSeleccionar: (inicio: string, fin: string, profesionalId: string, profesionalNombre: string) => void
  profesionales: { id: string; nombre: string }[]
}) {
  const [profesionalSeleccionado, setProfesionalSeleccionado] = useState(profesionales[0]?.id ?? '')
  const prof = profesionales.find((p) => p.id === profesionalSeleccionado)

  return (
    <div className="space-y-3">
      {profesionales.length > 1 && (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Profesional disponible</label>
          <Select value={profesionalSeleccionado} onValueChange={setProfesionalSeleccionado}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Seleccionar profesional..." />
            </SelectTrigger>
            <SelectContent>
              {profesionales.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {profesionalSeleccionado && (
        <SlotsProfesional
          profesionalId={profesionalSeleccionado}
          fecha={fecha}
          duracionMin={duracionMin}
          horaInicio={horaInicio}
          onSeleccionar={(inicio, fin) =>
            onSeleccionar(inicio, fin, profesionalSeleccionado, prof?.nombre ?? '')
          }
        />
      )}
    </div>
  )
}

export function StepFechaStaff() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [semanaOffset, setSemanaOffset] = useState(0)

  const {
    prioridadFiltro,
    profesionalFavorito,
    servicios,
    ejecucionParalela,
    fecha,
    horaInicio,
    horaFin,
    asignacionPersonal,
    setFechaHora,
    setAsignacion,
    duracionTotalMin,
  } = useCitaWizardStore()

  const duracion = duracionTotalMin()

  // Profesionales activos (para prioridad HORA)
  const { data: profesionalesData } = useQuery(
    empresaId && prioridadFiltro === 'HORA'
      ? `SELECT u.id, u.nombre FROM usuarios u
         INNER JOIN horarios_staff h ON h.usuario_id = u.id AND h.empresa_id = u.empresa_id AND h.is_active = 1
         WHERE u.empresa_id = ? AND u.is_active = 1
         GROUP BY u.id, u.nombre
         ORDER BY u.nombre`
      : '',
    empresaId && prioridadFiltro === 'HORA' ? [empresaId] : []
  )
  const profesionales = (profesionalesData ?? []) as { id: string; nombre: string }[]

  // Calcular dias de la semana
  const hoy = new Date()
  const inicioSemana = startOfWeek(addDays(hoy, semanaOffset * 7), { weekStartsOn: 1 })
  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i))

  const seleccionarFecha = (d: Date) => {
    const nuevaFecha = format(d, 'yyyy-MM-dd')
    setFechaHora(nuevaFecha, '', '')
  }

  const seleccionarSlot = (inicio: string, fin: string) => {
    setFechaHora(fecha, inicio, fin)
    // Si hay profesionalFavorito (EMPLEADO), crear asignacion para todos los servicios
    if (prioridadFiltro === 'EMPLEADO' && profesionalFavorito) {
      const asignaciones: AsignacionPersonal[] = servicios.map((_, idx) => ({
        servicioIdx: idx,
        trabajadorId: profesionalFavorito.id,
        trabajadorNombre: profesionalFavorito.nombre,
      }))
      setAsignacion(asignaciones)
    }
  }

  const seleccionarSlotConProfesional = (
    inicio: string,
    fin: string,
    profesionalId: string,
    profesionalNombre: string
  ) => {
    setFechaHora(fecha, inicio, fin)
    const asignaciones: AsignacionPersonal[] = servicios.map((_, idx) => ({
      servicioIdx: idx,
      trabajadorId: profesionalId,
      trabajadorNombre: profesionalNombre,
    }))
    setAsignacion(asignaciones)
  }

  // Asignacion por servicio (para ejecucion paralela)
  const actualizarAsignacionServicio = (servicioIdx: number, profesionalId: string, profesionalNombre: string) => {
    const nuevas = [...asignacionPersonal]
    const existente = nuevas.findIndex((a) => a.servicioIdx === servicioIdx)
    if (existente >= 0) {
      nuevas[existente] = { servicioIdx, trabajadorId: profesionalId, trabajadorNombre: profesionalNombre }
    } else {
      nuevas.push({ servicioIdx, trabajadorId: profesionalId, trabajadorNombre: profesionalNombre })
    }
    setAsignacion(nuevas)
  }

  return (
    <div className="space-y-5">
      {/* Selector de fecha (semana) */}
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
            <span className="text-xs text-muted-foreground px-1">
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
                onClick={() => !esPasado && seleccionarFecha(d)}
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
                <span className="text-[10px] uppercase">{format(d, 'EEE', { locale: es })}</span>
                <span className="font-semibold">{format(d, 'd')}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Slots disponibles */}
      {fecha && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Horario Disponible ({duracion} min)</label>

          {prioridadFiltro === 'EMPLEADO' && profesionalFavorito ? (
            <SlotsProfesional
              profesionalId={profesionalFavorito.id}
              fecha={fecha}
              duracionMin={duracion}
              horaInicio={horaInicio}
              onSeleccionar={seleccionarSlot}
            />
          ) : prioridadFiltro === 'HORA' ? (
            <SlotsHoraPrioridad
              fecha={fecha}
              duracionMin={duracion}
              horaInicio={horaInicio}
              onSeleccionar={seleccionarSlotConProfesional}
              profesionales={profesionales}
            />
          ) : null}
        </div>
      )}

      {/* Asignacion por servicio si ejecucion paralela */}
      {ejecucionParalela && servicios.length > 1 && horaInicio && profesionales.length > 0 && (
        <div className="space-y-3 border rounded-xl p-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <Users size={16} />
            Asignar profesional por servicio
          </p>
          {servicios.map((s, idx) => {
            const asignacion = asignacionPersonal.find((a) => a.servicioIdx === idx)
            return (
              <div key={s.productoId} className="space-y-1">
                <label className="text-xs text-muted-foreground">{s.nombre}</label>
                <Select
                  value={asignacion?.trabajadorId ?? ''}
                  onValueChange={(v) => {
                    const prof = profesionales.find((p) => p.id === v)
                    if (prof) actualizarAsignacionServicio(idx, prof.id, prof.nombre)
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Asignar profesional..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(prioridadFiltro === 'EMPLEADO' && profesionalFavorito
                      ? [profesionalFavorito]
                      : profesionales
                    ).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>
      )}

      {/* Resumen seleccion */}
      {fecha && horaInicio && (
        <div className="text-sm text-center p-3 bg-primary/5 rounded-xl border border-primary/20 text-primary font-medium">
          {format(new Date(fecha + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })} — {horaInicio} a {horaFin}
        </div>
      )}
    </div>
  )
}
