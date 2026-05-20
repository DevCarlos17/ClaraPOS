import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus, Trash, Check, X, ArrowRight } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import {
  usePlantillas,
  crearPlantilla,
  renombrarPlantilla,
  eliminarPlantilla,
  parsePlantillaData,
  buildPlantillaPreview,
  MAX_PLANTILLAS,
  type PlantillaData,
} from '../../hooks/use-horarios-plantillas'

const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 0]
const DEFAULT_DATA: PlantillaData[] = DIAS_SEMANA.map((d) => ({
  diaSemana: d,
  horaInicio: '08:00',
  horaFin: '17:00',
  isActive: d >= 1 && d <= 5,
  tiempoPreparacionMin: 0,
}))

interface PlantillasManagerProps {
  horarioActual: PlantillaData[]
  onAplicar: (data: PlantillaData[]) => void
}

export function PlantillasManager({ horarioActual, onAplicar }: PlantillasManagerProps) {
  const { plantillas, isLoading, empresaId } = usePlantillas()
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const puedCrear = plantillas.length < MAX_PLANTILLAS

  const handleNueva = async () => {
    if (!puedCrear || !empresaId) return
    setCargando(true)
    try {
      await crearPlantilla(empresaId, `Plantilla ${plantillas.length + 1}`, DEFAULT_DATA)
      toast.success('Plantilla creada')
    } catch {
      toast.error('Error al crear plantilla')
    } finally {
      setCargando(false)
    }
  }

  const handleGuardarDesdeActual = async () => {
    if (!puedCrear || !empresaId) return
    setCargando(true)
    try {
      await crearPlantilla(
        empresaId,
        `Plantilla ${plantillas.length + 1}`,
        horarioActual
      )
      toast.success('Horario actual guardado como plantilla')
    } catch {
      toast.error('Error al guardar plantilla')
    } finally {
      setCargando(false)
    }
  }

  const startEdit = (id: string, nombre: string) => {
    setEditandoId(id)
    setEditNombre(nombre)
  }

  const handleRenombrar = async (id: string) => {
    const nombre = editNombre.trim()
    if (!nombre) { setEditandoId(null); return }
    try {
      await renombrarPlantilla(id, nombre)
    } catch {
      toast.error('Error al renombrar')
    } finally {
      setEditandoId(null)
    }
  }

  const handleEliminar = async (id: string) => {
    try {
      await eliminarPlantilla(id)
      toast.success('Plantilla eliminada')
    } catch {
      toast.error('Error al eliminar')
    }
  }

  const handleAplicar = (data: string) => {
    const parsed = parsePlantillaData(data)
    if (parsed.length === 0) {
      toast.error('Plantilla sin datos')
      return
    }
    onAplicar(parsed)
    toast.success('Plantilla aplicada — guarda para confirmar')
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Cargando plantillas...</p>
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Plantillas de horario</p>
        <p className="text-xs text-muted-foreground">
          Guarda hasta {MAX_PLANTILLAS} plantillas y aplicalas a cualquier profesional con un clic.
          {plantillas.length >= MAX_PLANTILLAS && (
            <span className="text-amber-600 ml-1">Limite alcanzado.</span>
          )}
        </p>
      </div>

      {/* Lista de plantillas */}
      {plantillas.length === 0 ? (
        <div className="border-2 border-dashed rounded-xl py-8 text-center text-sm text-muted-foreground">
          No hay plantillas. Crea una para reutilizar horarios.
        </div>
      ) : (
        <div className="space-y-2">
          {plantillas.map((p) => {
            const preview = buildPlantillaPreview(parsePlantillaData(p.data))
            return (
              <div
                key={p.id}
                className="relative flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 hover:border-primary/40 transition-colors"
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Tooltip preview */}
                {hoveredId === p.id && (
                  <div className="absolute left-0 -top-[calc(100%+4px)] z-10 min-w-40 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md whitespace-pre-line pointer-events-none">
                    {preview}
                  </div>
                )}

                {/* Nombre editable */}
                {editandoId === p.id ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      autoFocus
                      value={editNombre}
                      onChange={(e) => setEditNombre(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenombrar(p.id)
                        if (e.key === 'Escape') setEditandoId(null)
                      }}
                      className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      onClick={() => handleRenombrar(p.id)}
                      className="text-primary hover:text-primary/80 transition-colors"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditandoId(null)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="flex-1 text-left text-sm font-medium truncate hover:text-primary transition-colors"
                    onClick={() => startEdit(p.id, p.nombre)}
                  >
                    {p.nombre}
                  </button>
                )}

                {/* Acciones */}
                {editandoId !== p.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => handleAplicar(p.data)}
                    >
                      <ArrowRight size={12} />
                      Aplicar
                    </Button>
                    <button
                      onClick={() => handleEliminar(p.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Botones de creacion */}
      <div className={cn('flex gap-2 flex-wrap', !puedCrear && 'opacity-50 pointer-events-none')}>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={handleNueva}
          disabled={cargando || !puedCrear}
        >
          <Plus size={13} />
          Nueva plantilla vacia
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={handleGuardarDesdeActual}
          disabled={cargando || !puedCrear}
        >
          <Plus size={13} />
          Guardar horario actual como plantilla
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {plantillas.length}/{MAX_PLANTILLAS} plantillas · Haz clic en el nombre para editarlo
      </p>
    </div>
  )
}
