import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useExcepcionesPorUsuario,
  crearExcepcion,
  eliminarExcepcion,
  type HorarioExcepcion,
  type TipoExcepcion,
} from '../../hooks/use-horarios-excepciones'
import { Trash, Plus, CalendarX, Clock, Warning } from '@phosphor-icons/react'
import { NativeSelect } from '@/components/ui/native-select'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface ExcepcionesTabProps {
  profesionalId: string
  empresaId: string
  userId: string
}

const TIPO_CONFIG: Record<TipoExcepcion, { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string }> = {
  DIA_LIBRE: {
    label: 'Dia Libre',
    icon: CalendarX,
    color: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  HORARIO_MODIFICADO: {
    label: 'Horario Modificado',
    icon: Clock,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  BLOQUEO_EMERGENCIA: {
    label: 'Bloqueo Emergencia',
    icon: Warning,
    color: 'bg-red-100 text-red-700 border-red-200',
  },
}

function ExcepcionRow({
  excepcion,
  onEliminar,
}: {
  excepcion: HorarioExcepcion
  onEliminar: () => void
}) {
  const cfg = TIPO_CONFIG[excepcion.tipo as TipoExcepcion]
  const Icon = cfg?.icon ?? CalendarX

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${cfg?.color ?? ''}`}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {format(new Date(excepcion.fecha + 'T12:00:00'), "EEEE d 'de' MMMM, yyyy", {
            locale: es,
          })}
        </p>
        <p className="text-xs opacity-80 capitalize">{cfg?.label}</p>
        {excepcion.hora_inicio && excepcion.hora_fin && (
          <p className="text-xs opacity-70">
            {excepcion.hora_inicio} - {excepcion.hora_fin}
          </p>
        )}
        {excepcion.motivo && (
          <p className="text-xs opacity-70 italic mt-0.5">{excepcion.motivo}</p>
        )}
      </div>
      <button
        onClick={onEliminar}
        className="p-1 rounded hover:bg-black/10 shrink-0"
        aria-label="Eliminar excepcion"
      >
        <Trash size={13} />
      </button>
    </div>
  )
}

export function ExcepcionesTab({ profesionalId, empresaId, userId }: ExcepcionesTabProps) {
  const { excepciones, isLoading } = useExcepcionesPorUsuario(profesionalId)
  const [agregando, setAgregando] = useState(false)
  const [fecha, setFecha] = useState('')
  const [tipo, setTipo] = useState<TipoExcepcion>('DIA_LIBRE')
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [horaFin, setHoraFin] = useState('18:00')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const handleGuardar = async () => {
    if (!fecha) {
      toast.error('Selecciona una fecha')
      return
    }
    setGuardando(true)
    try {
      await crearExcepcion({
        usuarioId: profesionalId,
        empresaId,
        fecha,
        tipo,
        horaInicio: tipo !== 'DIA_LIBRE' ? horaInicio : undefined,
        horaFin: tipo !== 'DIA_LIBRE' ? horaFin : undefined,
        motivo: motivo || undefined,
        creadoPor: userId,
      })
      toast.success('Excepcion guardada')
      setAgregando(false)
      setFecha('')
      setMotivo('')
      setTipo('DIA_LIBRE')
    } catch {
      toast.error('Error al guardar excepcion')
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (id: string) => {
    try {
      await eliminarExcepcion(id)
      toast.success('Excepcion eliminada')
    } catch {
      toast.error('Error al eliminar excepcion')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Dias libres, horarios modificados o bloqueos de emergencia.
        </p>
        {!agregando && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAgregando(true)}>
            <Plus size={14} />
            Agregar
          </Button>
        )}
      </div>

      {agregando && (
        <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
          <p className="text-sm font-medium">Nueva excepcion</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Fecha</label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Tipo</label>
              <NativeSelect
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoExcepcion)}
                className="h-8 text-sm"
              >
                <option value="DIA_LIBRE">Dia Libre</option>
                <option value="HORARIO_MODIFICADO">Horario Modificado</option>
                <option value="BLOQUEO_EMERGENCIA">Bloqueo Emergencia</option>
              </NativeSelect>
            </div>
          </div>

          {tipo !== 'DIA_LIBRE' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Hora inicio</label>
                <Input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Hora fin</label>
                <Input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">Motivo (opcional)</label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Cita medica, viaje..."
              className="h-8 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAgregando(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleGuardar} disabled={guardando} className="flex-1">
              {guardando ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>
      ) : excepciones.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-2xl text-muted-foreground text-sm">
          Sin excepciones configuradas
        </div>
      ) : (
        <div className="space-y-2">
          {excepciones.map((e) => (
            <ExcepcionRow
              key={e.id}
              excepcion={e}
              onEliminar={() => handleEliminar(e.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
