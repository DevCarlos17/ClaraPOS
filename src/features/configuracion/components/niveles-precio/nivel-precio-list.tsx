import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, PencilSimple } from '@phosphor-icons/react'
import {
  useNivelesPrecio,
  actualizarNivelPrecio,
  type NivelPrecio,
} from '@/features/configuracion/hooks/use-niveles-precio'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { NivelPrecioForm } from './nivel-precio-form'

export function NivelPrecioList() {
  const { niveles, isLoading } = useNivelesPrecio()
  const { user } = useCurrentUser()
  const [formOpen, setFormOpen] = useState(false)
  const [editingNivel, setEditingNivel] = useState<NivelPrecio | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingNivel(undefined)
    setFormOpen(true)
  }

  function handleEditar(nivel: NivelPrecio) {
    setEditingNivel(nivel)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingNivel(undefined)
  }

  async function handleToggleActivo(nivel: NivelPrecio) {
    if (nivel.orden === 1) return
    const nuevoEstado = nivel.is_active !== 1
    setTogglingId(nivel.id)
    try {
      await actualizarNivelPrecio(nivel.id, {
        is_active: nuevoEstado,
        updated_by: user?.id,
      })
      toast.success(nuevoEstado ? 'Nivel activado' : 'Nivel desactivado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  const puedeAgregar = niveles.length < 3

  const nextOrden = niveles.length > 0
    ? Math.max(...niveles.map((n) => n.orden)) + 1
    : 1

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Niveles de Precio</h2>
        {puedeAgregar && (
          <button
            onClick={handleNuevo}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Agregar Nivel
          </button>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Define hasta 3 niveles de precio. El Nivel 1 es el precio principal y no puede desactivarse.
        Los nombres y margenes defecto se reflejan en el formulario de productos.
      </p>

      {niveles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">Sin niveles configurados</p>
          <p className="text-sm mt-1">Agrega el primer nivel de precio</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-16">Orden</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Margen Default %</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {niveles.map((nivel) => (
                <tr key={nivel.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {nivel.orden}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground font-medium">{nivel.nombre}</td>
                  <td className="px-4 py-3 text-right text-foreground tabular-nums">
                    {parseFloat(nivel.porcentaje_defecto) > 0
                      ? `${parseFloat(nivel.porcentaje_defecto).toFixed(2)}%`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActivo(nivel)}
                      disabled={togglingId === nivel.id || nivel.orden === 1}
                      className="disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      title={nivel.orden === 1 ? 'El nivel principal no puede desactivarse' : undefined}
                    >
                      {nivel.is_active === 1 ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                          Inactivo
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEditar(nivel)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-md hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                    >
                      <PencilSimple className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NivelPrecioForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        nivel={editingNivel}
        nextOrden={nextOrden}
      />
    </div>
  )
}
