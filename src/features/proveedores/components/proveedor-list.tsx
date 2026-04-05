import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import {
  useProveedores,
  actualizarProveedor,
  type Proveedor,
} from '@/features/proveedores/hooks/use-proveedores'
import { ProveedorForm } from './proveedor-form'

export function ProveedorList() {
  const { proveedores, isLoading } = useProveedores()
  const [formOpen, setFormOpen] = useState(false)
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingProveedor(undefined)
    setFormOpen(true)
  }

  function handleEditar(proveedor: Proveedor) {
    setEditingProveedor(proveedor)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingProveedor(undefined)
  }

  async function handleToggleActivo(proveedor: Proveedor) {
    const nuevoEstado = proveedor.activo !== 1
    setTogglingId(proveedor.id)
    try {
      await actualizarProveedor(proveedor.id, { activo: nuevoEstado })
      toast.success(nuevoEstado ? 'Proveedor activado' : 'Proveedor desactivado')
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
        <h2 className="text-lg font-semibold text-gray-900">Proveedores</h2>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo Proveedor
        </button>
      </div>

      {proveedores.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay proveedores registrados</p>
          <p className="text-sm mt-1">Crea el primer proveedor para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">RIF</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Razon Social</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 hidden md:table-cell">Telefono</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 hidden lg:table-cell">Correo</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700 hidden sm:table-cell">IVA</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700 hidden sm:table-cell">ISLR</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((prov) => (
                <tr key={prov.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-900">{prov.rif}</td>
                  <td className="px-4 py-3 text-gray-900 font-medium">{prov.razon_social}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{prov.telefono || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{prov.correo || '-'}</td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    {prov.retiene_iva === 1 ? (
                      <span className="text-green-600 font-medium">Si</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    {prov.retiene_islr === 1 ? (
                      <span className="text-green-600 font-medium">Si</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActivo(prov)}
                      disabled={togglingId === prov.id}
                      className="disabled:opacity-50"
                    >
                      {prov.activo === 1 ? (
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
                      onClick={() => handleEditar(prov)}
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

      <ProveedorForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        proveedor={editingProveedor}
      />
    </div>
  )
}
