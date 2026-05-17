import { useRef, useState, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import type { EventClickArg, DateSelectArg, EventInput, EventDropArg } from '@fullcalendar/core'
import {
  useCitasRango,
  reprogramarCita,
  type Cita,
  type CitaOperStatus,
} from '../../hooks/use-citas'
import { registrarCitaLog } from '../../hooks/use-cita-log'
import { useClientes } from '@/features/clientes/hooks/use-clientes'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { CitaDetalleModal } from './cita-detalle-modal'
import { DragConfirmPopover, type DragConfirmState } from './drag-confirm-popover'
import { Button } from '@/components/ui/button'
import { CaretLeft, CaretRight, Plus } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const STATUS_COLORS: Record<CitaOperStatus, string> = {
  RESERVADA:  '#F59E0B',
  EN_PROCESO: '#8B5CF6',
  REALIZADA:  '#10B981',
  CANCELADA:  '#EF4444',
}

type CalendarView = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'listWeek'

interface Profesional {
  id: string
  nombre: string
  color: string
}

const PROFESIONAL_COLORS = [
  '#2563EB', '#7C3AED', '#DB2777', '#059669', '#D97706',
  '#0891B2', '#DC2626', '#16A34A', '#9333EA', '#C2410C',
]

export function CalendarioCitas() {
  const calendarRef = useRef<FullCalendar | null>(null)
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { hasPermission } = usePermissions()
  const esSupervisor = hasPermission(PERMISSIONS.CITAS_MANAGE)

  const [view, setView] = useState<CalendarView>('timeGridWeek')
  const [titulo, setTitulo] = useState('')
  const [rangoInicio, setRangoInicio] = useState('')
  const [rangoFin, setRangoFin] = useState('')
  const [profesionalesFiltro, setProfesionalesFiltro] = useState<Set<string>>(new Set())
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingDrop, setPendingDrop] = useState<DragConfirmState | null>(null)

  const { citas } = useCitasRango(rangoInicio, rangoFin)
  const { clientes } = useClientes()

  const { data: usuariosData } = useQuery(
    empresaId
      ? 'SELECT id, nombre FROM usuarios WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre'
      : '',
    empresaId ? [empresaId] : []
  )
  const profesionales: Profesional[] = (
    (usuariosData ?? []) as { id: string; nombre: string }[]
  ).map((u, i) => ({
    id: u.id,
    nombre: u.nombre,
    color: PROFESIONAL_COLORS[i % PROFESIONAL_COLORS.length],
  }))

  const clienteMap = new Map(clientes.map((c) => [c.id, c.nombre]))
  const profesionalMap = new Map(profesionales.map((p) => [p.id, p]))

  const eventos: EventInput[] = citas
    .filter((c) => profesionalesFiltro.size === 0 || profesionalesFiltro.has(c.profesional_id))
    .map((c) => {
      const prof = profesionalMap.get(c.profesional_id)
      const citaStatus = c.cita_status as CitaOperStatus
      const color = prof?.color ?? STATUS_COLORS[citaStatus] ?? '#3B82F6'
      const esArrastrable =
        esSupervisor && (citaStatus === 'RESERVADA' || citaStatus === 'EN_PROCESO')
      return {
        id: c.id,
        title: clienteMap.get(c.cliente_id) ?? 'Cliente',
        start: c.fecha_inicio,
        end: c.fecha_fin,
        backgroundColor: color,
        borderColor: color,
        textColor: '#ffffff',
        editable: esArrastrable,
        extendedProps: { cita: c, profesionalNombre: prof?.nombre ?? '' },
      }
    })

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const cita = arg.event.extendedProps.cita as Cita
    setCitaSeleccionada(cita)
    setModalOpen(true)
  }, [])

  const handleDateSelect = useCallback(
    (_arg: DateSelectArg) => {
      navigate({ to: '/citas/nueva' as any })
    },
    [navigate]
  )

  const handleDatesSet = useCallback(
    (info: { start: Date; end: Date; view: { title: string } }) => {
      setRangoInicio(info.start.toISOString())
      setRangoFin(info.end.toISOString())
      setTitulo(info.view.title)
    },
    []
  )

  const handleEventDrop = useCallback(
    (arg: EventDropArg) => {
      const cita = arg.event.extendedProps.cita as Cita
      const citaStatus = cita.cita_status as CitaOperStatus

      if (citaStatus === 'REALIZADA' || citaStatus === 'CANCELADA') {
        arg.revert()
        return
      }

      const nuevaFechaInicio = arg.event.start
      const nuevaFechaFin = arg.event.end
      if (!nuevaFechaInicio || !nuevaFechaFin) {
        arg.revert()
        return
      }

      setPendingDrop({
        citaId: cita.id,
        clienteNombre: clienteMap.get(cita.cliente_id) ?? 'Cliente',
        nuevaFechaInicio,
        nuevaFechaFin,
        revert: arg.revert,
      })
    },
    [clienteMap]
  )

  const handleConfirmDrop = useCallback(async () => {
    if (!pendingDrop) return
    try {
      await reprogramarCita(
        pendingDrop.citaId,
        pendingDrop.nuevaFechaInicio.toISOString(),
        pendingDrop.nuevaFechaFin.toISOString(),
        user?.id ?? ''
      )
      await registrarCitaLog({
        empresaId,
        citaId: pendingDrop.citaId,
        usuarioId: user?.id ?? '',
        accion: 'DRAG_AND_DROP',
        datosNuevos: {
          fecha_inicio: pendingDrop.nuevaFechaInicio.toISOString(),
          fecha_fin: pendingDrop.nuevaFechaFin.toISOString(),
        },
      })
      toast.success('Cita reprogramada')
    } catch {
      pendingDrop.revert()
      toast.error('Error al reprogramar')
    } finally {
      setPendingDrop(null)
    }
  }, [pendingDrop, user, empresaId])

  const handleCancelDrop = useCallback(() => {
    if (pendingDrop) {
      pendingDrop.revert()
      setPendingDrop(null)
    }
  }, [pendingDrop])

  const changeView = (v: CalendarView) => {
    setView(v)
    calendarRef.current?.getApi().changeView(v)
  }

  const goToday = () => calendarRef.current?.getApi().today()
  const goPrev = () => calendarRef.current?.getApi().prev()
  const goNext = () => calendarRef.current?.getApi().next()

  const toggleProfesional = (id: string) => {
    setProfesionalesFiltro((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clienteNombre = citaSeleccionada
    ? (clienteMap.get(citaSeleccionada.cliente_id) ?? '')
    : ''
  const profesionalNombre = citaSeleccionada
    ? (profesionalMap.get(citaSeleccionada.profesional_id)?.nombre ?? '')
    : ''

  const VIEW_LABELS: Record<CalendarView, string> = {
    timeGridDay: 'Dia',
    timeGridWeek: 'Semana',
    dayGridMonth: 'Mes',
    listWeek: 'Lista',
  }

  return (
    <div className="flex h-full gap-4">
      {/* Panel izquierdo */}
      <div className="hidden lg:flex flex-col gap-4 w-52 shrink-0">
        <Button
          onClick={() => navigate({ to: '/citas/nueva' as any })}
          className="w-full gap-2"
          size="sm"
        >
          <Plus size={16} />
          Nueva Cita
        </Button>

        {profesionales.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Profesionales
            </p>
            <div className="space-y-1.5">
              {profesionales.map((p) => {
                const activo = profesionalesFiltro.size === 0 || profesionalesFiltro.has(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleProfesional(p.id)}
                    className={cn(
                      'flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-sm transition-all',
                      activo ? 'opacity-100' : 'opacity-40'
                    )}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="truncate">{p.nombre}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Calendario principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={goToday}>
            Hoy
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={goPrev} className="h-8 w-8">
              <CaretLeft size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={goNext} className="h-8 w-8">
              <CaretRight size={16} />
            </Button>
          </div>
          <h2 className="text-base font-semibold flex-1 capitalize">{titulo}</h2>

          <div className="flex items-center border rounded-lg overflow-hidden">
            {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={cn(
                  'px-3 py-1.5 text-sm transition-colors',
                  view === v
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            className="gap-2 lg:hidden"
            onClick={() => navigate({ to: '/citas/nueva' as any })}
          >
            <Plus size={16} />
          </Button>
        </div>

        <div className="flex-1 [&_.fc]:font-sans [&_.fc-timegrid-slot]:h-8 [&_.fc-event]:cursor-pointer [&_.fc-event]:rounded-md [&_.fc-event]:shadow-sm">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView={view}
            locale="es"
            events={eventos}
            selectable
            selectMirror
            editable={esSupervisor}
            select={handleDateSelect}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            eventDrop={handleEventDrop}
            headerToolbar={false}
            height="100%"
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
            slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            allDaySlot={false}
            nowIndicator
            businessHours={{
              daysOfWeek: [1, 2, 3, 4, 5, 6],
              startTime: '08:00',
              endTime: '20:00',
            }}
            dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
            buttonText={{
              today: 'Hoy',
              month: 'Mes',
              week: 'Semana',
              day: 'Dia',
              list: 'Lista',
            }}
          />
        </div>
      </div>

      <CitaDetalleModal
        cita={citaSeleccionada}
        clienteNombre={clienteNombre}
        profesionalNombre={profesionalNombre}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />

      {pendingDrop && (
        <DragConfirmPopover
          state={pendingDrop}
          onConfirm={handleConfirmDrop}
          onCancel={handleCancelDrop}
        />
      )}
    </div>
  )
}
