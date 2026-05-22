import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  CalendarDots,
  Clock,
  User,
  Stethoscope,
  CurrencyDollar,
  CheckSquare,
  XCircle,
  ArrowRight,
  ArrowsClockwise,
  ClockCounterClockwise,
  Play,
  CheckCircle,
  UserMinus,
  ShoppingCart,
  Warning,
  Lock,
  CalendarPlus,
} from '@phosphor-icons/react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Cita, CitaOperStatus } from '../../hooks/use-citas'
import { iniciarAtencion, finalizarCita, cancelarCita } from '../../hooks/use-citas'
import { useCitaLog, registrarCitaLog, type CitaLogEntry } from '../../hooks/use-cita-log'
import { sincronizarCitaGoogle } from '../../hooks/use-google-calendar'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { toast } from 'sonner'
import { formatUsd } from '@/lib/currency'
import { ReprogramarModal } from './reprogramar-modal'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'

interface CitaDetalleModalProps {
  cita: Cita | null
  clienteNombre: string
  profesionalNombre: string
  open: boolean
  onClose: () => void
}

function parseDatos(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function formatFechaLog(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return ''
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm", { locale: es })
  } catch {
    return iso
  }
}

interface AuditEntryConfig {
  icon: React.ReactNode
  title: string
  detail?: string
  colorClass?: string
}

function buildAuditConfig(entry: CitaLogEntry): AuditEntryConfig {
  const nuevos = parseDatos(entry.datos_nuevos)
  const anteriores = parseDatos(entry.datos_anteriores)

  switch (entry.accion) {
    case 'AGENDADA':
      return {
        icon: <CalendarPlus size={14} className="text-primary" />,
        title: 'Cita agendada',
        detail: nuevos.fecha_inicio
          ? `${formatFechaLog(nuevos.fecha_inicio)}`
          : undefined,
      }

    case 'REPROGRAMADA': {
      const metodo = nuevos.metodo === 'arrastrar' ? 'arrastrar y soltar' : 'modal'
      const fechaAnterior = anteriores.fecha_inicio ? formatFechaLog(anteriores.fecha_inicio) : null
      const fechaNueva = nuevos.fecha_inicio ? formatFechaLog(nuevos.fecha_inicio) : null
      const motivo = typeof nuevos.motivo === 'string' ? nuevos.motivo : null
      const lines: string[] = []
      if (fechaAnterior && fechaNueva) lines.push(`${fechaAnterior} → ${fechaNueva}`)
      if (motivo) lines.push(`Motivo: ${motivo}`)
      lines.push(`Via: ${metodo}`)
      if (nuevos.profesional_nombre) lines.push(`Nuevo profesional: ${nuevos.profesional_nombre}`)
      return {
        icon: <ArrowsClockwise size={14} className="text-blue-500" />,
        title: 'Reprogramada',
        detail: lines.join(' · '),
      }
    }

    case 'STATUS_CHANGE': {
      const nuevoStatus = nuevos.cita_status as string | undefined
      if (nuevoStatus === 'EN_PROCESO') {
        return {
          icon: <Play size={14} className="text-purple-500" />,
          title: 'Iniciada',
        }
      }
      if (nuevoStatus === 'REALIZADA') {
        return {
          icon: <CheckCircle size={14} className="text-green-600" />,
          title: 'Finalizada',
        }
      }
      return {
        icon: <ClockCounterClockwise size={14} className="text-muted-foreground" />,
        title: `Estado: ${nuevoStatus ?? ''}`,
      }
    }

    case 'CANCELADA':
      return {
        icon: <XCircle size={14} className="text-red-500" />,
        title: 'Cancelada',
        detail: nuevos.autorizado_por ? 'Autorizado por supervisor' : undefined,
        colorClass: 'text-red-600',
      }

    case 'PAGADA':
      return {
        icon: <CurrencyDollar size={14} className="text-green-600" />,
        title: 'Pago registrado',
        detail: typeof nuevos.checkout_tipo === 'string' ? nuevos.checkout_tipo : undefined,
        colorClass: 'text-green-700',
      }

    case 'NO_SHOW':
      return {
        icon: <UserMinus size={14} className="text-orange-500" />,
        title: 'No se presentó',
        detail: nuevos.detectado_automaticamente === true ? 'Detectado automáticamente' : undefined,
      }

    case 'MINI_POS_ADD':
      return {
        icon: <ShoppingCart size={14} className="text-blue-500" />,
        title: 'Producto agregado',
        detail: typeof nuevos.nombre === 'string' ? nuevos.nombre : undefined,
      }

    case 'SOBRETURNO_AUTORIZADO':
      return {
        icon: <Warning size={14} className="text-yellow-500" />,
        title: 'Sobreturno autorizado',
      }

    case 'BLOQUEO_ADMIN':
      return {
        icon: <Lock size={14} className="text-muted-foreground" />,
        title: 'Afectada por bloqueo de agenda',
      }

    case 'REUBICACION_POR_BLOQUEO':
      return {
        icon: <ArrowRight size={14} className="text-muted-foreground" />,
        title: 'Reasignada por bloqueo',
        detail: typeof nuevos.profesional_nombre === 'string'
          ? `Nuevo profesional: ${nuevos.profesional_nombre}`
          : undefined,
      }

    default:
      return {
        icon: <ClockCounterClockwise size={14} className="text-muted-foreground" />,
        title: entry.accion.replace(/_/g, ' '),
      }
  }
}

const STATUS_CONFIG: Record<CitaOperStatus, { label: string; color: string }> = {
  RESERVADA:  { label: 'Reservada',   color: 'bg-yellow-100 text-yellow-800' },
  EN_PROCESO: { label: 'En Proceso',  color: 'bg-purple-100 text-purple-800' },
  REALIZADA:  { label: 'Realizada',   color: 'bg-green-100 text-green-800' },
  CANCELADA:  { label: 'Cancelada',   color: 'bg-red-100 text-red-800' },
  NO_SHOW:    { label: 'No Asistio',  color: 'bg-orange-100 text-orange-800' },
}

type ModalTab = 'detalle' | 'historial'

export function CitaDetalleModal({
  cita,
  clienteNombre,
  profesionalNombre,
  open,
  onClose,
}: CitaDetalleModalProps) {
  const { user } = useCurrentUser()
  const [tab, setTab] = useState<ModalTab>('detalle')
  const [cargando, setCargando] = useState(false)
  const [reprogramarOpen, setReprogramarOpen] = useState(false)
  const [showPinCancelar, setShowPinCancelar] = useState(false)

  const { log, isLoading: logLoading } = useCitaLog(cita?.id ?? '')

  if (!cita) return null

  const citaStatus = (cita.cita_status as CitaOperStatus) ?? 'RESERVADA'
  const statusCfg = STATUS_CONFIG[citaStatus] ?? STATUS_CONFIG.RESERVADA
  const esTerminal = citaStatus === 'REALIZADA' || citaStatus === 'CANCELADA' || citaStatus === 'NO_SHOW'

  const handleIniciar = async () => {
    setCargando(true)
    try {
      await iniciarAtencion(cita.id, user?.id ?? '')
      await registrarCitaLog({
        empresaId: cita.empresa_id,
        citaId: cita.id,
        usuarioId: user?.id ?? '',
        accion: 'STATUS_CHANGE',
        datosAnteriores: { cita_status: citaStatus },
        datosNuevos: { cita_status: 'EN_PROCESO' },
      })
      toast.success('Atencion iniciada')
      onClose()
    } catch {
      toast.error('Error al iniciar atencion')
    } finally {
      setCargando(false)
    }
  }

  const handleFinalizar = async () => {
    setCargando(true)
    try {
      await finalizarCita(
        cita.id,
        user?.id ?? '',
        cita.timestamp_inicio ?? cita.fecha_inicio,
        cita.duracion_min
      )
      await registrarCitaLog({
        empresaId: cita.empresa_id,
        citaId: cita.id,
        usuarioId: user?.id ?? '',
        accion: 'STATUS_CHANGE',
        datosAnteriores: { cita_status: 'EN_PROCESO' },
        datosNuevos: { cita_status: 'REALIZADA' },
      })
      void sincronizarCitaGoogle({
        action: 'update',
        profesional_id: cita.profesional_id,
        cita: {
          fecha_inicio: cita.fecha_inicio,
          fecha_fin: cita.fecha_fin,
          cliente_nombre: clienteNombre,
          status: 'REALIZADA',
          google_event_id: cita.google_event_id,
        },
      })
      toast.success('Cita finalizada')
      onClose()
    } catch {
      toast.error('Error al finalizar cita')
    } finally {
      setCargando(false)
    }
  }

  const handleCancelar = () => {
    setShowPinCancelar(true)
  }

  const handleCancelarAutorizado = async (supervisorId: string) => {
    setCargando(true)
    try {
      await cancelarCita(cita.id, user?.id ?? '')
      await registrarCitaLog({
        empresaId: cita.empresa_id,
        citaId: cita.id,
        usuarioId: user?.id ?? '',
        accion: 'CANCELADA',
        datosAnteriores: { cita_status: citaStatus },
        datosNuevos: { cita_status: 'CANCELADA', autorizado_por: supervisorId },
      })
      void sincronizarCitaGoogle({
        action: 'delete',
        profesional_id: cita.profesional_id,
        cita: {
          fecha_inicio: cita.fecha_inicio,
          fecha_fin: cita.fecha_fin,
          google_event_id: cita.google_event_id,
        },
      })
      toast.success('Cita cancelada')
      onClose()
    } catch {
      toast.error('Error al cancelar cita')
    } finally {
      setCargando(false)
    }
  }

  const fechaInicio = new Date(cita.fecha_inicio)
  const fechaFin = new Date(cita.fecha_fin)
  const esFechaPasada = fechaInicio < new Date(new Date().setHours(0, 0, 0, 0))

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDots size={20} className="text-primary" />
              Detalle de Cita
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex border-b">
            {(['detalle', 'historial'] as ModalTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium transition-colors capitalize border-b-2 -mb-px ${
                  tab === t
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'historial' ? 'Historial' : 'Detalle'}
              </button>
            ))}
          </div>

          {tab === 'detalle' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Estado</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDots size={16} className="text-muted-foreground" />
                  <span className="font-medium">
                    {format(fechaInicio, "EEEE d 'de' MMMM, yyyy", { locale: es })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={16} className="text-muted-foreground" />
                  <span>
                    {format(fechaInicio, 'HH:mm')} - {format(fechaFin, 'HH:mm')}
                    <span className="text-muted-foreground ml-1">({cita.duracion_min} min)</span>
                  </span>
                </div>
                {cita.timestamp_inicio && citaStatus === 'EN_PROCESO' && (
                  <div className="text-xs text-muted-foreground pl-6">
                    Inicio real: {format(new Date(cita.timestamp_inicio), 'HH:mm')}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User size={16} className="text-muted-foreground" />
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-medium">{clienteNombre}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Stethoscope size={16} className="text-muted-foreground" />
                  <span className="text-muted-foreground">Profesional:</span>
                  <span className="font-medium">{profesionalNombre}</span>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-2 text-sm">
                <CurrencyDollar size={16} className="text-muted-foreground" />
                <span className="text-muted-foreground">Total:</span>
                <span className="font-semibold text-primary">
                  {formatUsd(parseFloat(cita.total_usd))}
                </span>
              </div>

              {cita.notas && (
                <>
                  <Separator />
                  <div className="text-sm">
                    <span className="text-muted-foreground block mb-1">Notas:</span>
                    <p>{cita.notas}</p>
                  </div>
                </>
              )}

              {!esTerminal && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    {citaStatus === 'RESERVADA' && (
                      <Button
                        size="sm"
                        onClick={handleIniciar}
                        className="w-full gap-2"
                        disabled={cargando}
                      >
                        <ArrowRight size={16} />
                        Iniciar Atencion
                      </Button>
                    )}

                    {citaStatus === 'EN_PROCESO' && (
                      <Button
                        size="sm"
                        onClick={handleFinalizar}
                        className="w-full gap-2 bg-green-600 hover:bg-green-700"
                        disabled={cargando}
                      >
                        <CheckSquare size={16} />
                        Finalizar
                      </Button>
                    )}

                    <div className="flex gap-2">
                      {citaStatus === 'RESERVADA' && !esFechaPasada && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5"
                          onClick={() => setReprogramarOpen(true)}
                          disabled={cargando}
                        >
                          <ArrowsClockwise size={14} />
                          Reprogramar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-destructive hover:bg-destructive/10 gap-1.5"
                        onClick={handleCancelar}
                        disabled={cargando}
                      >
                        <XCircle size={14} />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'historial' && (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {logLoading ? (
                <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>
              ) : log.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sin historial</p>
              ) : (
                log.map((entry) => {
                  const audit = buildAuditConfig(entry)
                  return (
                    <div key={entry.id} className="flex gap-3 py-2.5 border-b last:border-b-0">
                      <div className="shrink-0 mt-0.5">{audit.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${audit.colorClass ?? ''}`}>
                          {audit.title}
                        </p>
                        {audit.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {audit.detail}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {format(new Date(entry.created_at), "d MMM, HH:mm", { locale: es })}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {reprogramarOpen && (
        <ReprogramarModal
          cita={cita}
          clienteNombre={clienteNombre}
          profesionalNombre={profesionalNombre}
          open={reprogramarOpen}
          onClose={() => setReprogramarOpen(false)}
          onReprogramado={() => {
            setReprogramarOpen(false)
            onClose()
          }}
        />
      )}

      <SupervisorPinDialog
        isOpen={showPinCancelar}
        onClose={() => setShowPinCancelar(false)}
        onAuthorized={handleCancelarAutorizado}
        titulo="Cancelar Cita"
        mensaje="Se requiere autorización de supervisor para cancelar esta cita."
        requiredPermission="citas.gestionar"
      />
    </>
  )
}
