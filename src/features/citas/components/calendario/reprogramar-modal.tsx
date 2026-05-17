import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { reprogramarCita, type Cita } from '../../hooks/use-citas'
import { registrarCitaLog } from '../../hooks/use-cita-log'
import { sincronizarCitaGoogle } from '../../hooks/use-google-calendar'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { toast } from 'sonner'
import { format, addMinutes } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowsClockwise } from '@phosphor-icons/react'

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
  const [guardando, setGuardando] = useState(false)

  const fechaActual = new Date(cita.fecha_inicio)
  const [nuevaFecha, setNuevaFecha] = useState(format(fechaActual, 'yyyy-MM-dd'))
  const [nuevaHora, setNuevaHora] = useState(format(fechaActual, 'HH:mm'))

  const calcularNuevaFechaFin = () => {
    const inicio = new Date(`${nuevaFecha}T${nuevaHora}:00`)
    const fin = addMinutes(inicio, cita.duracion_min)
    return fin.toISOString()
  }

  const handleConfirmar = async () => {
    setGuardando(true)
    try {
      const nuevaFechaInicio = new Date(`${nuevaFecha}T${nuevaHora}:00`).toISOString()
      const nuevaFechaFin = calcularNuevaFechaFin()

      await reprogramarCita(cita.id, nuevaFechaInicio, nuevaFechaFin, user?.id ?? '')
      await registrarCitaLog({
        empresaId: cita.empresa_id,
        citaId: cita.id,
        usuarioId: user?.id ?? '',
        accion: 'MODAL_REPROGRAMAR',
        datosAnteriores: { fecha_inicio: cita.fecha_inicio, fecha_fin: cita.fecha_fin },
        datosNuevos: { fecha_inicio: nuevaFechaInicio, fecha_fin: nuevaFechaFin },
      })
      void sincronizarCitaGoogle({
        action: 'update',
        profesional_id: cita.profesional_id,
        cita: {
          fecha_inicio: nuevaFechaInicio,
          fecha_fin: nuevaFechaFin,
          cliente_nombre: clienteNombre,
          status: cita.cita_status,
          google_event_id: cita.google_event_id,
        },
      })
      toast.success('Cita reprogramada')
      onReprogramado()
    } catch {
      toast.error('Error al reprogramar cita')
    } finally {
      setGuardando(false)
    }
  }

  const horaFin = (() => {
    try {
      const fin = addMinutes(new Date(`${nuevaFecha}T${nuevaHora}:00`), cita.duracion_min)
      return format(fin, 'HH:mm')
    } catch {
      return '--:--'
    }
  })()

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
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
              Profesional: {profesionalNombre}
            </p>
            <p className="text-muted-foreground text-xs">
              Actual:{' '}
              {format(new Date(cita.fecha_inicio), "EEE d 'de' MMM 'a las' HH:mm", {
                locale: es,
              })}{' '}
              ({cita.duracion_min} min)
            </p>
          </div>

          {/* Nueva fecha */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nueva fecha</label>
            <Input
              type="date"
              value={nuevaFecha}
              onChange={(e) => setNuevaFecha(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              className="h-9 text-sm"
            />
          </div>

          {/* Nueva hora */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nueva hora de inicio</label>
            <Input
              type="time"
              value={nuevaHora}
              onChange={(e) => setNuevaHora(e.target.value)}
              className="h-9 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Fin estimado: {horaFin} ({cita.duracion_min} min de duracion)
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button size="sm" onClick={handleConfirmar} disabled={guardando} className="flex-1">
              {guardando ? 'Guardando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
