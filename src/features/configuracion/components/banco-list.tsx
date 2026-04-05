import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import {
  useBancos,
  updateBanco,
  type Banco,
} from '@/features/configuracion/hooks/use-bancos'
import { BancoForm } from './banco-form'

export function BancoList() {
  const { bancos, isLoading } = useBancos()
  const [formOpen, setFormOpen] = useState(false)
  const [editingBanco, setEditingBanco] = useState<Banco | undefined>(undefined)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function handleNuevo() {
    setEditingBanco(undefined)
    setFormOpen(true)
  }

  function handleEditar(banco: Banco) {
    setEditingBanco(banco)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingBanco(undefined)
  }

  async function handleToggleActivo(banco: Banco) {
    const nuevoEstado = banco.activo !== 1
    setTogglingId(banco.id)
    try {
      await updateBanco(banco.id, { activo: nuevoEstado })
      toast.success(nuevoEstado ? 'Banco activado' : 'Banco desactivado')
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
        <h2 className="text-lg font-semibold text-gray-900">Bancos</h2>
        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo Banco
        </button>
      </div>

      {bancos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay bancos registrados</p>
          <p className="text-sm mt-1">Crea el primer banco para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Banco</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Numero de Cuenta</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Cedula / RIF</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {bancos.map((b) => (
                <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">{b.banco}</td>
                  <td className="px-4 py-3 text-gray-900 font-mono text-xs">{b.numero_cuenta}</td>
                  <td className="px-4 py-3 text-gray-900">{b.cedula_rif}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActivo(b)}
                      disabled={togglingId === b.id}
                      className="disabled:opacity-50"
                    >
                      {b.activo === 1 ? (
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
                      onClick={() => handleEditar(b)}
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

      <BancoForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        banco={editingBanco}
      />
    </div>
  )
}
