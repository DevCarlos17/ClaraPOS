import { useState, useEffect, useRef } from 'react'
import {
  useHorariosProfesional,
  guardarHorariosProfesional,
  getNombreDia,
  type HorarioStaff,
} from '../../hooks/use-horarios-staff'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useQuery } from '@powersync/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { FloppyDisk, Clock, Warning, UserList } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { BreaksEditor } from './breaks-editor'
import { ExcepcionesTab } from './excepciones-tab'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'
import { EmergencyBlockModal } from './emergency-block-modal'

interface DiaConfig {
  diaSemana: number
  horaInicio: string
  horaFin: string
  isActive: boolean
  tiempoPreparacionMin: number
}

const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 0]

const DEFAULT_DIA: Omit<DiaConfig, 'diaSemana'> = {
  horaInicio: '08:00',
  horaFin: '17:00',
  isActive: false,
  tiempoPreparacionMin: 0,
}

type Tab = 'plantilla' | 'excepciones'

function buildInitialDias(horarios: HorarioStaff[]): DiaConfig[] {
  return DIAS_SEMANA.map((d) => {
    const h = horarios.find((x) => x.dia_semana === d)
    if (h) {
      return {
        diaSemana: d,
        horaInicio: h.hora_inicio,
        horaFin: h.hora_fin,
        isActive: h.is_active === 1,
        tiempoPreparacionMin: (h as any).tiempo_preparacion_min ?? 0,
      }
    }
    return { diaSemana: d, ...DEFAULT_DIA }
  })
}

export function HorariosStaffPage() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const [profesionalId, setProfesionalId] = useState('')
  const [profesionalNombre, setProfesionalNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [tab, setTab] = useState<Tab>('plantilla')
  const [horariosDia, setHorariosDia] = useState<DiaConfig[]>(
    DIAS_SEMANA.map((d) => ({ diaSemana: d, ...DEFAULT_DIA }))
  )
  const [dirty, setDirty] = useState(false)
  const [pendingProfesional, setPendingProfesional] = useState<{ id: string; nombre: string } | null>(null)
  const [dialogoDescartar, setDialogoDescartar] = useState(false)
  const [emergencyOpen, setEmergencyOpen] = useState(false)

  const { data: profesionalesData } = useQuery(
    empresaId
      ? 'SELECT id, nombre FROM usuarios WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre'
      : '',
    empresaId ? [empresaId] : []
  )
  const profesionales = (profesionalesData ?? []) as { id: string; nombre: string }[]

  const { horarios } = useHorariosProfesional(profesionalId)

  // Referencia a la configuracion original para detectar cambios
  const baselineRef = useRef<DiaConfig[]>([])

  useEffect(() => {
    const nuevos = buildInitialDias(horarios)
    setHorariosDia(nuevos)
    baselineRef.current = nuevos
    setDirty(false)
  }, [horarios, profesionalId])

  const updateDia = (
    diaSemana: number,
    field: keyof Omit<DiaConfig, 'diaSemana'>,
    value: string | boolean | number
  ) => {
    setHorariosDia((prev) =>
      prev.map((d) => (d.diaSemana === diaSemana ? { ...d, [field]: value } : d))
    )
    setDirty(true)
  }

  const handleSeleccionarProfesional = (id: string, nombre: string) => {
    if (dirty && profesionalId) {
      setPendingProfesional({ id, nombre })
      setDialogoDescartar(true)
      return
    }
    setProfesionalId(id)
    setProfesionalNombre(nombre)
    setTab('plantilla')
  }

  const handleGuardar = async () => {
    if (!profesionalId) {
      toast.error('Selecciona un profesional primero')
      return
    }
    setGuardando(true)
    try {
      await guardarHorariosProfesional(profesionalId, empresaId, horariosDia)
      setDirty(false)
      baselineRef.current = horariosDia
      toast.success(`Horarios de ${profesionalNombre} guardados`)
    } catch {
      toast.error('Error al guardar horarios')
    } finally {
      setGuardando(false)
    }
  }

  const handleDescartar = () => {
    if (pendingProfesional) {
      setProfesionalId(pendingProfesional.id)
      setProfesionalNombre(pendingProfesional.nombre)
      setPendingProfesional(null)
    }
    setDialogoDescartar(false)
    setDirty(false)
  }

  const handleGuardarYCambiar = async () => {
    await handleGuardar()
    if (pendingProfesional) {
      setProfesionalId(pendingProfesional.id)
      setProfesionalNombre(pendingProfesional.nombre)
      setPendingProfesional(null)
    }
    setDialogoDescartar(false)
  }

  const habilitarSemanaLaboral = () => {
    setHorariosDia((prev) =>
      prev.map((d) => ({
        ...d,
        isActive: d.diaSemana >= 1 && d.diaSemana <= 6,
        horaInicio: '08:00',
        horaFin: '17:00',
      }))
    )
    setDirty(true)
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Panel lateral: lista de profesionales */}
      <div className="w-52 shrink-0 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <UserList size={14} />
          Profesionales
        </p>
        {profesionales.map((p) => (
          <button
            key={p.id}
            onClick={() => handleSeleccionarProfesional(p.id, p.nombre)}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all',
              profesionalId === p.id
                ? 'bg-primary text-primary-foreground font-medium'
                : 'hover:bg-muted text-muted-foreground'
            )}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      {/* Panel central */}
      <div className="flex-1 flex flex-col min-w-0">
        {!profesionalId ? (
          <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-2xl text-muted-foreground text-sm">
            Selecciona un profesional para configurar sus horarios
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">{profesionalNombre}</h3>
                {dirty && (
                  <p className="text-xs text-orange-500 flex items-center gap-1">
                    <Warning size={11} />
                    Cambios sin guardar
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {tab === 'plantilla' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5"
                    onClick={() => setEmergencyOpen(true)}
                  >
                    <Warning size={14} />
                    Bloqueo
                  </Button>
                )}
                {tab === 'plantilla' && (
                  <Button onClick={handleGuardar} disabled={guardando} size="sm" className="gap-2">
                    <FloppyDisk size={14} />
                    {guardando ? 'Guardando...' : `Guardar ${profesionalNombre}`}
                  </Button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b mb-4">
              {(['plantilla', 'excepciones'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors',
                    tab === t
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t === 'plantilla' ? 'Plantilla Rutinaria' : 'Excepciones'}
                </button>
              ))}
            </div>

            {tab === 'plantilla' && (
              <div className="flex-1 overflow-y-auto space-y-4">
                {/* Acciones rapidas */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={habilitarSemanaLaboral}
                    className="text-xs"
                  >
                    Sem. Laboral (Lun-Sab)
                  </Button>
                </div>

                {/* Grid de dias */}
                <div className="border rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-[140px_1fr_1fr_56px] text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 px-4 py-2 border-b">
                    <span>Dia</span>
                    <span>Entrada</span>
                    <span>Salida</span>
                    <span className="text-center">Activo</span>
                  </div>

                  {horariosDia.map((d) => {
                    const horarioDB = horarios.find((h) => h.dia_semana === d.diaSemana)
                    return (
                      <div key={d.diaSemana} className="border-b last:border-b-0">
                        <div
                          className={cn(
                            'grid grid-cols-[140px_1fr_1fr_56px] items-center px-4 py-2.5 gap-3 transition-colors',
                            d.isActive ? 'bg-card' : 'bg-muted/20'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Clock
                              size={14}
                              className={d.isActive ? 'text-primary' : 'text-muted-foreground'}
                            />
                            <span
                              className={cn(
                                'text-sm font-medium',
                                !d.isActive && 'text-muted-foreground'
                              )}
                            >
                              {getNombreDia(d.diaSemana)}
                            </span>
                          </div>

                          <Input
                            type="time"
                            value={d.horaInicio}
                            onChange={(e) => updateDia(d.diaSemana, 'horaInicio', e.target.value)}
                            disabled={!d.isActive}
                            className="h-8 text-sm"
                          />

                          <Input
                            type="time"
                            value={d.horaFin}
                            onChange={(e) => updateDia(d.diaSemana, 'horaFin', e.target.value)}
                            disabled={!d.isActive}
                            className="h-8 text-sm"
                          />

                          <div className="flex justify-center">
                            <input
                              type="checkbox"
                              checked={d.isActive}
                              onChange={(e) =>
                                updateDia(d.diaSemana, 'isActive', e.target.checked)
                              }
                              className="w-4 h-4 rounded accent-primary cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Breaks editor (solo dias activos con registro en DB) */}
                        {d.isActive && horarioDB && (
                          <div className="px-4 pb-2 bg-muted/10 border-t">
                            <p className="text-xs text-muted-foreground mt-1.5 mb-0.5">
                              Descansos:
                            </p>
                            <BreaksEditor
                              horarioStaffId={horarioDB.id}
                              empresaId={empresaId}
                            />
                          </div>
                        )}
                        {d.isActive && !horarioDB && (
                          <div className="px-4 pb-2 bg-muted/10 border-t">
                            <p className="text-xs text-muted-foreground mt-1.5 italic">
                              Guarda primero para poder agregar descansos
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Tiempo de preparacion global */}
                <div className="border rounded-xl p-4 space-y-2">
                  <p className="text-sm font-medium">
                    Tiempo de preparacion para {profesionalNombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Minutos entre citas para preparar el espacio o descansar.
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={0}
                      max={60}
                      value={horariosDia[0]?.tiempoPreparacionMin ?? 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0
                        setHorariosDia((prev) =>
                          prev.map((d) => ({ ...d, tiempoPreparacionMin: val }))
                        )
                        setDirty(true)
                      }}
                      className="w-24 h-8 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">minutos</span>
                  </div>
                </div>
              </div>
            )}

            {tab === 'excepciones' && (
              <div className="flex-1 overflow-y-auto">
                <ExcepcionesTab
                  profesionalId={profesionalId}
                  empresaId={empresaId}
                  userId={user?.id ?? ''}
                />
              </div>
            )}
          </>
        )}
      </div>

      <UnsavedChangesDialog
        open={dialogoDescartar}
        profesionalNombre={profesionalNombre}
        onGuardar={handleGuardarYCambiar}
        onDescartar={handleDescartar}
        onCancelar={() => {
          setPendingProfesional(null)
          setDialogoDescartar(false)
        }}
      />

      {emergencyOpen && (
        <EmergencyBlockModal
          profesionalId={profesionalId}
          profesionalNombre={profesionalNombre}
          empresaId={empresaId}
          userId={user?.id ?? ''}
          open={emergencyOpen}
          onClose={() => setEmergencyOpen(false)}
        />
      )}
    </div>
  )
}
