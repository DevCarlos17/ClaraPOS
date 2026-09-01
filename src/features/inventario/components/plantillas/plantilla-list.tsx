import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, PencilSimple, Trash } from '@phosphor-icons/react'
import {
  usePlantillasTraspaso,
  desactivarPlantilla,
  type PlantillaConProductos,
} from '@/features/inventario/hooks/use-plantillas-traspaso'
import { PlantillaForm } from './plantilla-form'

export function PlantillaList() {
  const { plantillas, isLoading } = usePlantillasTraspaso()
  const [desactivandoId, setDesactivandoId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingPlantilla, setEditingPlantilla] = useState<PlantillaConProductos | undefined>(undefined)

  function handleNuevo() {
    setEditingPlantilla(undefined)
    setFormOpen(true)
  }

  function handleEditar(plantilla: PlantillaConProductos) {
    setEditingPlantilla(plantilla)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingPlantilla(undefined)
  }

  async function handleDesactivar(plantilla: PlantillaConProductos) {
    setDesactivandoId(plantilla.id)
    try {
      await desactivarPlantilla(plantilla.id, plantilla.empresa_id)
      toast.success('Plantilla desactivada')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setDesactivandoId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Plantillas</h2>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nueva Plantilla
        </button>
      </div>

      {plantillas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay plantillas registradas</p>
          <p className="text-sm mt-1">Crea la primera plantilla para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descripcion</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Productos</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {plantillas.map((p) => (
                <tr key={p.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">{p.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.descripcion ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{p.items_count}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => handleEditar(p)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <PencilSimple className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleDesactivar(p)}
                        disabled={desactivandoId === p.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <Trash className="h-3.5 w-3.5" />
                        Desactivar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PlantillaForm isOpen={formOpen} onClose={handleCloseForm} plantilla={editingPlantilla} />
    </div>
  )
}
