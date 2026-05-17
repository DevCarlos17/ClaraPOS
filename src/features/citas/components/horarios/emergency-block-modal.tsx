import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useQuery } from '@powersync/react'
import { crearExcepcion } from '../../hooks/use-horarios-excepciones'
import { kysely } from '@/core/db/kysely/kysely'
import { localNow } from '@/lib/dates'
import { toast } from 'sonner'
import { Warning, CalendarX } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface CitaAfectada {
  id: string
  cliente_id: string
  fecha_inicio: string
  fecha_fin: string
  cliente_nombre: string
}

interface EmergencyBlockModalProps {
  profesionalId: string
  profesionalNombre: string
  empresaId: string
  userId: string
  open: boolean
  onClose: () => void
}

export function EmergencyBlockModal({
  profesionalId,
  profesionalNombre,
  empresaId,
  userId,
  open,
  onClose,
}: EmergencyBlockModalProps) {
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [horaFin, setHoraFin] = useState('18:00')
  const [motivo, setMotivo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [citasAfectadas, setCitasAfectadas] = useState<CitaAfectada[]>([])
  const [reasignaciones, setReasignaciones] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  // Profesionales para reasignacion
  const { data: profesionalesData } = useQuery(
    empresaId
      ? 'SELECT id, nombre FROM usuarios WHERE empresa_id = ? AND is_active = 1 AND id != ? ORDER BY nombre'
      : '',
    empresaId ? [empresaId, profesionalId] : []
  )
  const profesionales = (profesionalesData ?? []) as { id: string; nombre: string }[]

  const handleBuscar = async () => {
    if (!fecha || !horaInicio || !horaFin) return
    setBuscando(true)
    try {
      const inicio = `${fecha}T${horaInicio}:00.000Z`
      const fin = `${fecha}T${horaFin}:00.000Z`

      const rows = await kysely
        .selectFrom('citas')
        .innerJoin('clientes', 'clientes.id', 'citas.cliente_id')
        .select([
          'citas.id',
          'citas.cliente_id',
          'citas.fecha_inicio',
          'citas.fecha_fin',
          'clientes.nombre as cliente_nombre',
        ])
        .where('citas.empresa_id', '=', empresaId)
        .where('citas.profesional_id', '=', profesionalId)
        .where('citas.fecha_inicio', '<', fin)
        .where('citas.fecha_fin', '>', inicio)
        .where('citas.cita_status', 'not in', ['CANCELADA', 'REALIZADA'])
        .execute()

      setCitasAfectadas(rows as CitaAfectada[])
    } catch {
      toast.error('Error al buscar citas afectadas')
    } finally {
      setBuscando(false)
    }
  }

  const handleConfirmar = async () => {
    setGuardando(true)
    try {
      // Crear excepcion
      await crearExcepcion({
        usuarioId: profesionalId,
        empresaId,
        fecha,
        tipo: 'BLOQUEO_EMERGENCIA',
        horaInicio,
        horaFin,
        motivo: motivo || undefined,
        creadoPor: userId,
      })

      // Reasignar o cancelar citas afectadas
      for (const cita of citasAfectadas) {
        const nuevoProfesional = reasignaciones[cita.id]
        if (nuevoProfesional) {
          await kysely
            .updateTable('citas')
            .set({ profesional_id: nuevoProfesional, updated_at: localNow(), updated_by: userId })
            .where('id', '=', cita.id)
            .execute()
        }
      }

      toast.success('Bloqueo de emergencia creado')
      onClose()
    } catch {
      toast.error('Error al crear bloqueo')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Warning size={18} />
            Bloqueo de Emergencia — {profesionalNombre}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
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
              <label className="text-xs font-medium">Desde</label>
              <Input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Hasta</label>
              <Input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Motivo</label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Emergencia familiar, enfermedad..."
              className="h-8 text-sm"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleBuscar}
            disabled={buscando}
            className="w-full"
          >
            {buscando ? 'Buscando...' : 'Verificar citas afectadas'}
          </Button>

          {citasAfectadas.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">
                {citasAfectadas.length} cita(s) afectada(s):
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {citasAfectadas.map((cita) => (
                  <div key={cita.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted">
                    <CalendarX size={14} className="text-destructive shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{cita.cliente_nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(cita.fecha_inicio), 'HH:mm', { locale: es })} -{' '}
                        {format(new Date(cita.fecha_fin), 'HH:mm', { locale: es })}
                      </p>
                    </div>
                    <select
                      value={reasignaciones[cita.id] ?? ''}
                      onChange={(e) =>
                        setReasignaciones((prev) => ({ ...prev, [cita.id]: e.target.value }))
                      }
                      className="h-7 text-xs rounded border border-input bg-background px-1.5 shrink-0"
                    >
                      <option value="">Sin reasignar</option>
                      {profesionales.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleConfirmar}
              disabled={guardando}
              className="flex-1"
            >
              {guardando ? 'Guardando...' : 'Confirmar Bloqueo'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
