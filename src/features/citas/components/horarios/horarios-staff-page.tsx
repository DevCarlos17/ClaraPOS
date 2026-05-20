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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { FloppyDisk, Clock, Warning, UserList } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { BreaksEditor } from './breaks-editor'
import { ExcepcionesTab } from './excepciones-tab'
import { PlantillasManager } from './plantillas-manager'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'
import { EmergencyBlockModal } from './emergency-block-modal'
import type { PlantillaData } from '../../hooks/use-horarios-plantillas'

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

type Tab = 'plantilla' | 'excepciones' | 'plantillas'

// PostgreSQL TIME devuelve "HH:MM:SS"; normalizar a "HH:MM" para inputs type="time"
function normalizeTime(t: string): string {
  if (!t) return t
  return t.length === 8 && t[2] === ':' && t[5] === ':' ? t.slice(0, 5) : t
}

function buildInitialDias(horarios: HorarioStaff[]): DiaConfig[] {
  return DIAS_SEMANA.map((d) => {
    const h = horarios.find((x) => x.dia_semana === d)
    if (h) {
      return {
        diaSemana: d,
        horaInicio: normalizeTime(h.hora_inicio),
        horaFin: normalizeTime(h.hora_fin),
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
  // Rastrea el profesional anterior para detectar cambios de seleccion
  const prevProfesionalIdRef = useRef<string>('')
  // Previene reset transitorio: PowerSync limpia UUIDs locales antes de sincronizar
  // los UUIDs de Supabase, generando una ventana donde horarios=[]. Sin este flag
  // el formulario se resetea a defaults en esa ventana aunque el guardado fue exitoso.
  const justSavedRef = useRef(false)
  // Espejo del estado actual del formulario accesible dentro del useEffect sin
  // agregarlo como dependencia (lo que causaria bucles infinitos).
  const formStateRef = useRef<DiaConfig[]>(horariosDia)

  // Mantener formStateRef sincronizado (fuera del useEffect para evitar dependencia)
  formStateRef.current = horariosDia

  useEffect(() => {
    const nuevos = buildInitialDias(horarios)
    const isNewProfesional = prevProfesionalIdRef.current !== profesionalId
    prevProfesionalIdRef.current = profesionalId

    console.log('🔄 [useEffect horarios]', {
      isNewProfesional,
      dirty,
      justSaved: justSavedRef.current,
      cantidadHorarios: horarios.length,
      horarios: horarios.map(h => `dia${h.dia_semana}:active=${h.is_active} ${h.hora_inicio}-${h.hora_fin}`),
    })

    if (isNewProfesional) {
      // Cambio de profesional: resetear siempre y limpiar flag post-guardado
      justSavedRef.current = false
      setHorariosDia(nuevos)
      baselineRef.current = nuevos
      setDirty(false)
      console.log('  → reset por nuevo profesional')
      console.table(nuevos.map(n => ({
        dia: n.diaSemana,
        activo: n.isActive ? '✓' : '✗',
        entrada: n.horaInicio,
        salida: n.horaFin,
        prep: n.tiempoPreparacionMin,
      })))
    } else if (!dirty) {
      if (horarios.length === 0) {
        // Array vacio mientras hay un profesional seleccionado = ventana transitoria
        // de PowerSync: los UUIDs locales fueron eliminados (no existen en Supabase
        // porque el PUT hizo UPDATE por clave natural conservando el UUID de Supabase)
        // pero los UUIDs reales de Supabase aun no llegaron via sync-down.
        // El caso genuino de professional sin horarios se maneja en isNewProfesional.
        console.log('  → ignorado (horarios vacio, ventana transitoria de PowerSync)')
      } else if (justSavedRef.current) {
        // Primera notificacion post-guardado con datos: podria ser data local pre-sync
        // que no refleja aun los valores de Supabase. No sobreescribir el formulario
        // — el usuario ya ve los valores correctos que guardo. Solo limpiar el flag.
        console.log('  → primera notificacion post-guardado, no sobreescribir (justSaved cleared)')
        justSavedRef.current = false
        baselineRef.current = nuevos
      } else {
        // ─── BRANCH D: sync desde DB ───────────────────────────────────────────
        // Comparar nuevos datos con el estado actual del formulario y con el baseline
        const formActual = formStateRef.current
        const diffVsForm = nuevos.filter(n => {
          const f = formActual.find(x => x.diaSemana === n.diaSemana)
          return f && (
            n.horaInicio !== f.horaInicio ||
            n.horaFin !== f.horaFin ||
            n.isActive !== f.isActive ||
            n.tiempoPreparacionMin !== f.tiempoPreparacionMin
          )
        })
        const diffVsBaseline = nuevos.filter(n => {
          const b = baselineRef.current.find(x => x.diaSemana === n.diaSemana)
          return b && (
            n.horaInicio !== b.horaInicio ||
            n.horaFin !== b.horaFin ||
            n.isActive !== b.isActive ||
            n.tiempoPreparacionMin !== b.tiempoPreparacionMin
          )
        })

        if (diffVsForm.length > 0) {
          console.warn('  ❌ [BRANCH D] BUG DETECTADO — DB sobreescribe el formulario con datos DISTINTOS:')
          diffVsForm.forEach(n => {
            const f = formActual.find(x => x.diaSemana === n.diaSemana)
            console.warn(`    dia${n.diaSemana}: form=[${f?.horaInicio}-${f?.horaFin} activo=${f?.isActive} prep=${f?.tiempoPreparacionMin}] → DB=[${n.horaInicio}-${n.horaFin} activo=${n.isActive} prep=${n.tiempoPreparacionMin}]`)
          })
        } else {
          console.log('  ✓ [BRANCH D] DB coincide con form actual (sin sobreescritura visible)')
        }

        if (diffVsBaseline.length > 0) {
          console.warn('  ⚠️ [BRANCH D] DB difiere del ultimo baseline guardado (Supabase puede NO tener la actualizacion):')
          diffVsBaseline.forEach(n => {
            const b = baselineRef.current.find(x => x.diaSemana === n.diaSemana)
            console.warn(`    dia${n.diaSemana}: baseline=[${b?.horaInicio}-${b?.horaFin} activo=${b?.isActive}] ≠ DB=[${n.horaInicio}-${n.horaFin} activo=${n.isActive}]`)
          })
          console.warn('  → Si ves esto DESPUES de guardar, el PATCH a Supabase fallo y sync-down esta revirtiendo el form.')
          console.warn('  → Busca errores "[PowerSync upload]" o "[upload PATCH horarios_staff]" mas arriba en el log.')
        } else {
          console.log('  ✓ [BRANCH D] DB coincide con baseline guardado')
        }

        setHorariosDia(nuevos)
        baselineRef.current = nuevos
      }
    } else {
      console.log('  → ignorado (dirty=true, cambios pendientes del usuario)')
    }
  }, [horarios, profesionalId, dirty])

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
      justSavedRef.current = true
      baselineRef.current = horariosDia
      toast.success(`Horarios de ${profesionalNombre} guardados`)
    } catch (err) {
      console.error('[HorariosStaff] Error al guardar:', err)
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

  const handleAplicarPlantilla = (data: PlantillaData[]) => {
    const mapped = DIAS_SEMANA.map((d) => {
      const src = data.find((x) => x.diaSemana === d)
      if (src) return { diaSemana: d, horaInicio: src.horaInicio, horaFin: src.horaFin, isActive: src.isActive, tiempoPreparacionMin: src.tiempoPreparacionMin }
      return { diaSemana: d, ...DEFAULT_DIA }
    })
    setHorariosDia(mapped)
    setDirty(true)
    setTab('plantilla')
  }

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* Panel lateral: lista de profesionales */}
      <div className="w-52 shrink-0 rounded-2xl bg-card border border-border shadow-sm p-3 flex flex-col overflow-hidden">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2 shrink-0">
          <UserList size={14} />
          Profesionales
        </p>
        <div className="space-y-1 overflow-y-auto flex-1">
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
      </div>

      {/* Panel central */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex-1 min-h-0 gap-0">
              <TabsList variant="line" className="w-full justify-start border-b border-border rounded-none h-auto p-0 mb-4">
                <TabsTrigger value="plantilla" className="rounded-none px-4 py-2 h-auto">Plantilla Rutinaria</TabsTrigger>
                <TabsTrigger value="excepciones" className="rounded-none px-4 py-2 h-auto">Excepciones</TabsTrigger>
                <TabsTrigger value="plantillas" className="rounded-none px-4 py-2 h-auto">Plantillas</TabsTrigger>
              </TabsList>

              <TabsContent value="plantilla" className="flex-1 min-h-0 overflow-y-auto mt-0">
              <div className="space-y-4">
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
                <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
                  <div className="grid grid-cols-[160px_160px_160px_1fr_64px] gap-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted px-4 py-2.5 border-b border-border">
                    <span>Dia</span>
                    <span>Entrada</span>
                    <span>Salida</span>
                    <span />
                    <span className="text-center">Activo</span>
                  </div>

                  {horariosDia.map((d) => {
                    const horarioDB = horarios.find((h) => h.dia_semana === d.diaSemana)
                    return (
                      <div key={d.diaSemana} className="border-b border-border last:border-b-0">
                        <div
                          className={cn(
                            'grid grid-cols-[160px_160px_160px_1fr_64px] items-center px-4 py-2.5 gap-3 transition-colors',
                            d.isActive ? 'bg-card hover:bg-muted/30' : 'bg-muted/20'
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

                          <div />

                          <div className="flex justify-center">
                            <Checkbox
                              checked={d.isActive}
                              onCheckedChange={(checked) =>
                                updateDia(d.diaSemana, 'isActive', Boolean(checked))
                              }
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
                <div className="rounded-xl bg-card border border-border shadow-sm p-4 space-y-2">
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
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (['-', 'e', 'E', '+', '.'].includes(e.key)) {
                          e.preventDefault()
                        }
                      }}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '') {
                          setHorariosDia((prev) =>
                            prev.map((d) => ({ ...d, tiempoPreparacionMin: 0 }))
                          )
                          setDirty(true)
                          return
                        }
                        const val = parseInt(raw)
                        if (isNaN(val)) return
                        const clamped = Math.min(60, Math.max(0, val))
                        setHorariosDia((prev) =>
                          prev.map((d) => ({ ...d, tiempoPreparacionMin: clamped }))
                        )
                        setDirty(true)
                      }}
                      className="w-24 h-8 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">minutos</span>
                  </div>
                </div>
              </div>
              </TabsContent>

              <TabsContent value="excepciones" className="flex-1 min-h-0 overflow-y-auto mt-0">
                <ExcepcionesTab
                  profesionalId={profesionalId}
                  empresaId={empresaId}
                  userId={user?.id ?? ''}
                />
              </TabsContent>

              <TabsContent value="plantillas" className="flex-1 min-h-0 overflow-y-auto mt-0">
                <PlantillasManager
                  horarioActual={horariosDia}
                  onAplicar={handleAplicarPlantilla}
                />
              </TabsContent>
            </Tabs>
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
