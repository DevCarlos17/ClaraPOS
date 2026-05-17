import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCitaWizardStore, type PrioridadFiltro } from '@/stores/cita-wizard-store'
import { cn } from '@/lib/utils'
import { UserFocus, Timer, CheckCircle } from '@phosphor-icons/react'

export function StepPrioridad() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { prioridadFiltro, profesionalFavorito, setPrioridad, setProfesionalFavorito } =
    useCitaWizardStore()

  const { data: profesionalesData } = useQuery(
    empresaId
      ? `SELECT u.id, u.nombre FROM usuarios u
         INNER JOIN horarios_staff h ON h.usuario_id = u.id AND h.empresa_id = u.empresa_id AND h.is_active = 1
         WHERE u.empresa_id = ? AND u.is_active = 1
         GROUP BY u.id, u.nombre
         ORDER BY u.nombre`
      : '',
    empresaId ? [empresaId] : []
  )
  const profesionales = (profesionalesData ?? []) as { id: string; nombre: string }[]

  const opciones: { tipo: PrioridadFiltro; titulo: string; subtitulo: string; desc: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string }[] = [
    {
      tipo: 'EMPLEADO',
      titulo: 'Prioridad Especialista',
      subtitulo: 'Fidelizado',
      desc: 'Prefiero ser atendido por un profesional especifico, aunque tenga que esperar mas.',
      icon: UserFocus,
      color: 'border-blue-400 bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-200',
    },
    {
      tipo: 'HORA',
      titulo: 'Prioridad Horaria',
      subtitulo: 'Apurado',
      desc: 'Me interesa el horario disponible mas proximo, sin importar el profesional.',
      icon: Timer,
      color: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200',
    },
  ]

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Selecciona como prefieres organizar la cita para este cliente.
      </p>

      {/* Tarjetas de seleccion */}
      <div className="grid gap-3">
        {opciones.map((opt) => {
          const activa = prioridadFiltro === opt.tipo
          return (
            <button
              key={opt.tipo}
              onClick={() => setPrioridad(opt.tipo)}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-all',
                activa ? opt.color : 'border-border hover:border-muted-foreground/30 hover:bg-muted/50'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                    activa ? 'bg-current/10' : 'bg-muted'
                  )}
                >
                  <opt.icon size={20} className={activa ? '' : 'text-muted-foreground'} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{opt.titulo}</div>
                  <div className="text-xs opacity-70 font-medium uppercase tracking-wider mt-0.5">
                    {opt.subtitulo}
                  </div>
                  <div className="text-xs mt-1.5 opacity-80">{opt.desc}</div>
                </div>
                {activa && <CheckCircle size={20} className="shrink-0 mt-0.5" />}
              </div>
            </button>
          )
        })}
      </div>

      {/* Seleccion de profesional si eligio EMPLEADO */}
      {prioridadFiltro === 'EMPLEADO' && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Selecciona el Profesional</p>
          {profesionales.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 border rounded-xl text-center">
              No hay profesionales con horarios configurados
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {profesionales.map((p) => {
                const seleccionado = profesionalFavorito?.id === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      seleccionado
                        ? setProfesionalFavorito(null)
                        : setProfesionalFavorito({ id: p.id, nombre: p.nombre })
                    }
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-medium',
                      seleccionado
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted'
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold',
                        seleccionado ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}
                    >
                      {p.nombre[0]?.toUpperCase()}
                    </div>
                    <span className="text-center leading-tight">{p.nombre}</span>
                    {seleccionado && <CheckCircle size={16} className="text-primary" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
