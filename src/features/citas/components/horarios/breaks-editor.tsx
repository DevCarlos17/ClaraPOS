import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  useDescansosDeHorario,
  agregarDescanso,
  eliminarDescanso,
  type HorarioDescanso,
} from '../../hooks/use-horarios-descansos'
import { Plus, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'

interface BreaksEditorProps {
  horarioStaffId: string
  empresaId: string
}

const TIPOS_DESCANSO = ['ALMUERZO', 'DESCANSO', 'OTRO']

function BreakRow({
  descanso,
  onEliminar,
}: {
  descanso: HorarioDescanso
  onEliminar: () => void
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium shrink-0">
        {descanso.tipo}
      </span>
      <span className="text-xs text-muted-foreground shrink-0">
        {descanso.hora_inicio} - {descanso.hora_fin}
      </span>
      <div className="flex-1" />
      <button
        onClick={onEliminar}
        className="p-1 rounded hover:bg-destructive/10 text-destructive"
        aria-label="Eliminar descanso"
      >
        <Trash size={12} />
      </button>
    </div>
  )
}

export function BreaksEditor({ horarioStaffId, empresaId }: BreaksEditorProps) {
  const { descansos, isLoading } = useDescansosDeHorario(horarioStaffId)
  const [agregando, setAgregando] = useState(false)
  const [horaInicio, setHoraInicio] = useState('12:00')
  const [horaFin, setHoraFin] = useState('13:00')
  const [tipo, setTipo] = useState('ALMUERZO')
  const [guardando, setGuardando] = useState(false)

  const handleAgregar = async () => {
    if (!horaInicio || !horaFin) return
    if (horaFin <= horaInicio) {
      toast.error('La hora de fin debe ser mayor a la de inicio')
      return
    }
    setGuardando(true)
    try {
      await agregarDescanso({ horarioStaffId, empresaId, horaInicio, horaFin, tipo })
      setAgregando(false)
      setHoraInicio('12:00')
      setHoraFin('13:00')
      setTipo('ALMUERZO')
    } catch {
      toast.error('Error al agregar descanso')
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (id: string) => {
    try {
      await eliminarDescanso(id)
    } catch {
      toast.error('Error al eliminar descanso')
    }
  }

  if (isLoading) return null

  return (
    <div className="mt-1.5 space-y-1">
      {descansos.length > 0 && (
        <div className="divide-y">
          {descansos.map((d) => (
            <BreakRow key={d.id} descanso={d} onEliminar={() => handleEliminar(d.id)} />
          ))}
        </div>
      )}

      {agregando ? (
        <div className="flex items-center gap-2 pt-1">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="h-7 text-xs rounded border border-input bg-background px-1.5"
          >
            {TIPOS_DESCANSO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Input
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            className="h-7 text-xs w-24"
          />
          <span className="text-xs text-muted-foreground">-</span>
          <Input
            type="time"
            value={horaFin}
            onChange={(e) => setHoraFin(e.target.value)}
            className="h-7 text-xs w-24"
          />
          <Button size="sm" className="h-7 text-xs px-2" onClick={handleAgregar} disabled={guardando}>
            OK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2"
            onClick={() => setAgregando(false)}
          >
            X
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setAgregando(true)}
          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
        >
          <Plus size={11} />
          Agregar descanso
        </button>
      )}
    </div>
  )
}
