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
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Motivos de Ajuste</h2>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo Motivo
        </button>
      </div>

      {motivos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay motivos de ajuste registrados</p>
          <p className="text-sm mt-1">Crea el primer motivo para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Operacion</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Afecta Costo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {motivos.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">
                    {m.nombre}
                    {m.es_sistema === 1 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-400/20 ring-inset">
                        Sistema
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {m.operacion_base === 'ENTRADA' ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        ENTRADA
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                        SALIDA
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
                        className="disabled:opacity-50"
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
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
