import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import {
  useAjusteMotivos,
  actualizarAjusteMotivo,
  type AjusteMotivo,
} from '@/features/inventario/hooks/use-ajuste-motivos'
import { AjusteMotivoForm } from './ajuste-motivo-form'

export function AjusteMotivoList() {
  const { motivos, isLoading } = useAjusteMotivos()
  const [formOpen, setFormOpen] = useState(false)
  const [editingMotivo, setEditingMotivo] = useState<AjusteMotivo | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingMotivo(undefined)
    setFormOpen(true)
  }

  function handleEditar(motivo: AjusteMotivo) {
    setEditingMotivo(motivo)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingMotivo(undefined)
  }

  async function handleToggleActivo(motivo: AjusteMotivo) {
    const nuevoEstado = motivo.is_active !== 1
    setTogglingId(motivo.id)
    try {
      await actualizarAjusteMotivo(motivo.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Motivo activado' : 'Motivo desactivado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card shadow-md p-6">
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
    <div className="rounded-xl bg-card shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Motivos de Ajuste</h2>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nuevo Motivo
        </button>
      </div>

      {motivos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-base font-medium">No hay motivos de ajuste registrados</p>
          <p className="text-sm mt-1">Crea el primer motivo para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Operacion</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Afecta Costo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {motivos.map((m) => (
                <tr key={m.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    {m.nombre}
                    {m.es_sistema === 1 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-400/20 ring-inset">
                        Sistema
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.operacion_base === 'SUMA' ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        SUMA
                      </span>
                    ) : m.operacion_base === 'RESTA' ? (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                        RESTA
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
                        NEUTRO
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.afecta_costo === 1 ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        Si
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
                        No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.es_sistema === 1 ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        Activo
                      </span>
                    ) : (
                      <button
                        onClick={() => handleToggleActivo(m)}
                        disabled={togglingId === m.id}
                        className="disabled:opacity-50 cursor-pointer"
                      >
                        {m.is_active === 1 ? (
                          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                            Inactivo
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.es_sistema !== 1 && (
                      <button
                        onClick={() => handleEditar(m)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AjusteMotivoForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        motivo={editingMotivo}
      />
    </div>
  )
}
