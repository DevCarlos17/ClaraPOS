import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import {
  useMarcas,
  actualizarMarca,
  type Marca,
} from '@/features/inventario/hooks/use-marcas'
import { MarcaForm } from './marca-form'

export function MarcaList() {
  const { marcas, isLoading } = useMarcas()
  const [formOpen, setFormOpen] = useState(false)
  const [editingMarca, setEditingMarca] = useState<Marca | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingMarca(undefined)
    setFormOpen(true)
  }

  function handleEditar(marca: Marca) {
    setEditingMarca(marca)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingMarca(undefined)
  }

  async function handleToggleActivo(marca: Marca) {
    const nuevoEstado = marca.is_active !== 1
    setTogglingId(marca.id)
    try {
      await actualizarMarca(marca.id, { is_active: nuevoEstado })
      toast.success(nuevoEstado ? 'Marca activada' : 'Marca desactivada')
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
        <h2 className="text-lg font-semibold text-gray-900">Marcas</h2>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva Marca
        </button>
      </div>

      {marcas.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay marcas registradas</p>
          <p className="text-sm mt-1">Crea la primera marca para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Descripcion</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {marcas.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">{m.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{m.descripcion ?? '—'}</td>
                  <td className="px-4 py-3">
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
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEditar(m)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MarcaForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        marca={editingMarca}
      />
    </div>
  )
}
