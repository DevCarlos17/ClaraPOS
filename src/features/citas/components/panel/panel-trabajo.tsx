import { useState } from 'react'
import { useCitasDelDia } from '../../hooks/use-citas'
import { useNoshowDetector } from '../../hooks/use-noshow-detector'
import { useClientes } from '@/features/clientes/hooks/use-clientes'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { useQuery } from '@powersync/react'
import { CitaCard } from './cita-card'
import { NuevaCitaSheet } from '../wizard/nueva-cita-sheet'
import { Button } from '@/components/ui/button'
import { Plus, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { useCitaWizardStore } from '@/stores/cita-wizard-store'
import type { Cita, CitaOperStatus } from '../../hooks/use-citas'

const COLUMNAS: {
  titulo: string
  statuses: CitaOperStatus[]
  accent: string
  badge: string
}[] = [
  {
    titulo: 'Por Atender',
    statuses: ['RESERVADA'],
    accent: 'bg-amber-400',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  {
    titulo: 'En Operacion',
    statuses: ['EN_PROCESO'],
    accent: 'bg-violet-500',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  },
  {
    titulo: 'Finalizados',
    statuses: ['REALIZADA', 'CANCELADA'],
    accent: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  {
    titulo: 'No Asistieron',
    statuses: ['NO_SHOW'],
    accent: 'bg-orange-400',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  },
]

export function PanelTrabajo() {
  useNoshowDetector()

  const { user } = useCurrentUser()
  const { openSheet } = useCitaWizardStore()
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
      <NuevaCitaSheet />
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
            onClick={() => openSheet()}
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
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-hidden">
          {COLUMNAS.map((col) => {
            const items = citasPorColumna(col.statuses)
            return (
              <div
                key={col.titulo}
                className="flex flex-col rounded-lg border border-border/60 bg-muted/25 overflow-hidden [box-shadow:inset_0_2px_6px_0_rgb(0_0_0_/_0.05)]"
              >
                {/* Header columna */}
                <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border/50 bg-background/70">
                  <div className={`w-1 h-4 rounded-full shrink-0 ${col.accent}`} />
                  <span className="font-semibold text-sm flex-1">{col.titulo}</span>
                  <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${col.badge}`}>
                    {items.length}
                  </span>
                </div>

                {/* Tarjetas */}
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                  {items.length === 0 ? (
                    <div className="text-center py-8 text-xs text-muted-foreground">
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
