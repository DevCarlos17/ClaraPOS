import { useState } from 'react'
import { useCitasDelDia } from '../../hooks/use-citas'
import { useClientes } from '@/features/clientes/hooks/use-clientes'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { useQuery } from '@powersync/react'
import { CitaCard } from './cita-card'
import { Button } from '@/components/ui/button'
import { Plus, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { useNavigate } from '@tanstack/react-router'
import type { Cita, CitaOperStatus } from '../../hooks/use-citas'

const COLUMNAS: { titulo: string; statuses: CitaOperStatus[]; color: string }[] = [
  {
    titulo: 'Por Atender',
    statuses: ['RESERVADA'],
    color: 'border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20',
  },
  {
    titulo: 'En Operacion',
    statuses: ['EN_PROCESO'],
    color: 'border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20',
  },
  {
    titulo: 'Finalizados',
    statuses: ['REALIZADA', 'CANCELADA'],
    color: 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20',
  },
]

export function PanelTrabajo() {
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { hasPermission } = usePermissions()

  const esSupervisor = hasPermission(PERMISSIONS.CITAS_MANAGE)

  const [fechaOffset, setFechaOffset] = useState(0)
  const fecha = format(addDays(new Date(), fechaOffset), 'yyyy-MM-dd')
  const esHoy = fechaOffset === 0

  // Supervisores pueden filtrar por profesional; operarios solo ven sus citas
  const [filtroProfesional, setFiltroProfesional] = useState(
    esSupervisor ? '' : (user?.id ?? '')
  )

  const { citas, isLoading } = useCitasDelDia(fecha)
  const { clientes } = useClientes()

  const { data: usuariosData } = useQuery(
    empresaId
      ? 'SELECT id, nombre FROM usuarios WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre'
      : '',
    empresaId ? [empresaId] : []
  )
  const profesionales = (usuariosData ?? []) as { id: string; nombre: string }[]

  const clienteMap = new Map(clientes.map((c) => [c.id, c.nombre]))
  const profesionalMap = new Map(profesionales.map((p) => [p.id, p.nombre]))

  const citasFiltradas = filtroProfesional
    ? citas.filter((c) => c.profesional_id === filtroProfesional)
    : citas

  const citasPorColumna = (statuses: CitaOperStatus[]): Cita[] =>
    citasFiltradas
      .filter((c) => statuses.includes(c.cita_status as CitaOperStatus))
      .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))

  const fechaDisplay = esHoy
    ? 'Hoy'
    : format(addDays(new Date(), fechaOffset), "EEEE d 'de' MMMM", { locale: es })

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Barra superior */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Navegacion de fecha */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setFechaOffset((p) => p - 1)}
          >
            <CaretLeft size={16} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFechaOffset(0)}
            className="min-w-28 capitalize text-sm"
          >
            {fechaDisplay}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setFechaOffset((p) => p + 1)}
          >
            <CaretRight size={16} />
          </Button>
        </div>

        {/* Filtro profesional (solo supervisores) */}
        {esSupervisor && (
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={filtroProfesional}
            onChange={(e) => setFiltroProfesional(e.target.value)}
          >
            <option value="">Todos los profesionales</option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        {hasPermission(PERMISSIONS.CITAS_CREATE) && (
          <Button
            size="sm"
            className="gap-2"
            onClick={() => navigate({ to: '/citas/nueva' as any })}
          >
            <Plus size={16} />
            Nueva Cita
          </Button>
        )}
      </div>

      {/* Columnas Kanban */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Cargando citas...
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-hidden">
          {COLUMNAS.map((col) => {
            const items = citasPorColumna(col.statuses)
            return (
              <div
                key={col.titulo}
                className={`flex flex-col rounded-2xl border-2 ${col.color} overflow-hidden`}
              >
                {/* Header columna */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <span className="font-semibold text-sm">{col.titulo}</span>
                  <span className="text-xs font-bold bg-white/70 dark:bg-black/20 rounded-full px-2 py-0.5">
                    {items.length}
                  </span>
                </div>

                {/* Tarjetas */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {items.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      Sin citas
                    </div>
                  ) : (
                    items.map((cita) => (
                      <CitaCard
                        key={cita.id}
                        cita={cita}
                        clienteNombre={clienteMap.get(cita.cliente_id) ?? 'Cliente'}
                        profesionalNombre={profesionalMap.get(cita.profesional_id) ?? 'Profesional'}
                        todasLasCitas={citas}
                        mostrarPrecios={esSupervisor}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
