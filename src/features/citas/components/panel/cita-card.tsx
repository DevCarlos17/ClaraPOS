import { useState } from 'react'
import { cn } from '@/lib/utils'
import { formatUsd } from '@/lib/currency'
import {
  iniciarAtencion,
  finalizarCita,
  cancelarCita,
  type Cita,
  type CitaOperStatus,
  type CitaFinanceStatus,
} from '../../hooks/use-citas'
import { registrarCitaLog } from '../../hooks/use-cita-log'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  Clock,
  User,
  Stethoscope,
  CurrencyDollar,
  Play,
  CheckSquare,
  X,
  ShoppingCart,
  WarningCircle,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { DelayIndicator } from './delay-indicator'
import { MiniPosModal } from './mini-pos-modal'

interface CitaCardProps {
  cita: Cita
  clienteNombre: string
  profesionalNombre: string
  servicioNombre?: string
  todasLasCitas: Cita[]
  mostrarPrecios: boolean
}

const FINANCE_BADGE: Record<CitaFinanceStatus, { label: string; cls: string }> = {
  PENDIENTE: { label: 'Pend. Pago', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  ABONADO:   { label: 'Abonado',    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  PAGADO:    { label: 'Pagado',     cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  NULO:      { label: 'Nulo',       cls: 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400' },
}

const CITA_STATUS_BADGE: Record<CitaOperStatus, { label: string; cls: string }> = {
  RESERVADA:  { label: 'Reservada',    cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  EN_PROCESO: { label: 'En Proceso',   cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  REALIZADA:  { label: 'Realizada',    cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  CANCELADA:  { label: 'Cancelada',    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  NO_SHOW:    { label: 'No Asistio',   cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
}

export function CitaCard({
  cita,
  clienteNombre,
  profesionalNombre,
  servicioNombre,
  todasLasCitas,
  mostrarPrecios,
}: CitaCardProps) {
  const { user } = useCurrentUser()
  const [cargando, setCargando] = useState(false)
  const [mostrarMiniPos, setMostrarMiniPos] = useState(false)
  const [showPinCancelar, setShowPinCancelar] = useState(false)

  const citaStatus = (cita.cita_status as CitaOperStatus) ?? 'RESERVADA'
  const financeStatus = (cita.finance_status as CitaFinanceStatus) ?? 'PENDIENTE'

  const statusBadge = CITA_STATUS_BADGE[citaStatus] ?? CITA_STATUS_BADGE.RESERVADA
  const financeBadge = FINANCE_BADGE[financeStatus]

  const horaInicio = format(new Date(cita.fecha_inicio), 'HH:mm')
  const horaFin = format(new Date(cita.fecha_fin), 'HH:mm')

  const esTerminal = citaStatus === 'REALIZADA' || citaStatus === 'CANCELADA' || citaStatus === 'NO_SHOW'

  // Indicador de retraso: cita RESERVADA cuya hora ya paso
  const ahora = Date.now()
  const fechaInicioMs = new Date(cita.fecha_inicio).getTime()
  const estaAtrasada = citaStatus === 'RESERVADA' && fechaInicioMs < ahora

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
      toast.success('Cita finalizada')
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
      toast.success('Cita cancelada')
    } catch {
      toast.error('Error al cancelar cita')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div
      className={cn(
        'bg-card border rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow space-y-2.5',
        estaAtrasada && 'border-red-300 ring-1 ring-red-200'
      )}
    >
      {/* Header: status operativo + hora */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', statusBadge.cls)}>
          {statusBadge.label}
        </span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={12} />
          {horaInicio} - {horaFin}
        </div>
      </div>

      {/* Indicador de retraso */}
      {estaAtrasada && (
        <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
          <WarningCircle size={12} className="shrink-0" />
          Cita atrasada
        </div>
      )}

      {/* Retraso acumulado por profesional (solo si hay EN_PROCESO antes) */}
      {citaStatus === 'RESERVADA' && (
        <DelayIndicator
          citas={todasLasCitas}
          profesionalId={cita.profesional_id}
        />
      )}

      {/* Cliente */}
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <User size={14} className="text-muted-foreground shrink-0" />
        <span className="truncate">{clienteNombre}</span>
      </div>

      {/* Profesional */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Stethoscope size={12} className="shrink-0" />
        <span className="truncate">{profesionalNombre}</span>
      </div>

      {servicioNombre && (
        <div className="text-xs text-muted-foreground pl-4 truncate">{servicioNombre}</div>
      )}

      {/* Finance status badge */}
      <div className="flex items-center justify-between">
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', financeBadge.cls)}>
          {financeBadge.label}
        </span>
        {/* Total (oculto para operarios) */}
        {mostrarPrecios && (
          <div className="flex items-center gap-0.5 text-sm font-semibold text-primary">
            <CurrencyDollar size={13} />
            {formatUsd(parseFloat(cita.total_usd))}
          </div>
        )}
      </div>

      {/* Timestamps de ejecucion real (EN_PROCESO) */}
      {citaStatus === 'EN_PROCESO' && cita.timestamp_inicio && (
        <div className="text-xs text-muted-foreground border-t pt-1.5">
          Inicio real: {format(new Date(cita.timestamp_inicio), 'HH:mm')}
        </div>
      )}

      {/* Desviacion (REALIZADA) */}
      {citaStatus === 'REALIZADA' && cita.desviacion_min !== null && (
        <div className={cn('text-xs border-t pt-1.5', cita.desviacion_min > 0 ? 'text-orange-600' : 'text-green-600')}>
          {cita.desviacion_min > 0
            ? `+${cita.desviacion_min} min sobre lo estimado`
            : cita.desviacion_min < 0
            ? `${Math.abs(cita.desviacion_min)} min antes`
            : 'En tiempo'}
        </div>
      )}

      {/* Acciones */}
      {!esTerminal && (
        <div className="flex flex-col gap-1.5 border-t pt-2">
          {citaStatus === 'RESERVADA' && (
            <Button
              size="sm"
              className="w-full h-7 text-xs gap-1.5"
              onClick={handleIniciar}
              disabled={cargando}
            >
              <Play size={12} />
              Iniciar Atencion
            </Button>
          )}

          {citaStatus === 'EN_PROCESO' && (
            <>
              <Button
                size="sm"
                className="w-full h-7 text-xs gap-1.5 bg-green-600 hover:bg-green-700"
                onClick={handleFinalizar}
                disabled={cargando}
              >
                <CheckSquare size={12} />
                Finalizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-xs gap-1.5"
                onClick={() => setMostrarMiniPos(true)}
              >
                <ShoppingCart size={12} />
                Agregar Items
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs text-destructive hover:bg-destructive/10"
            onClick={handleCancelar}
            disabled={cargando}
          >
            <X size={12} />
            Cancelar
          </Button>
        </div>
      )}

      {mostrarMiniPos && (
        <MiniPosModal
          cita={cita}
          userId={user?.id ?? ''}
          onClose={() => setMostrarMiniPos(false)}
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
    </div>
  )
}
