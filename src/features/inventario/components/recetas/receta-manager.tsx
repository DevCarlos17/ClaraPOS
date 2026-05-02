import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { PencilSimple, Trash, Check, X } from '@phosphor-icons/react'
import { useProductosTipo } from '@/features/inventario/hooks/use-productos'
import {
  useRecetasPorServicio,
  actualizarCantidadReceta,
  eliminarIngrediente,
} from '@/features/inventario/hooks/use-recetas'
import { IngredienteForm } from './ingrediente-form'

export function RecetaManager() {
  const { productos: servicios, isLoading: loadingServicios } = useProductosTipo('S')
  const { productos: productosP, isLoading: loadingProductos } = useProductosTipo('P')

  const [servicioId, setServicioId] = useState('')
  const [showIngredienteForm, setShowIngredienteForm] = useState(false)
  const [editingRecetaId, setEditingRecetaId] = useState<string | null>(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { recetas, isLoading: loadingRecetas } = useRecetasPorServicio(servicioId)

  const productoMap = useMemo(() => {
    const map = new Map<string, { nombre: string; codigo: string }>()
    for (const p of productosP) {
      map.set(p.id, { nombre: p.nombre, codigo: p.codigo })
    }
    return map
  }, [productosP])

  const existingProductIds = useMemo(() => {
    return recetas.map((r) => r.producto_id)
  }, [recetas])

  const handleIngredienteSuccess = useCallback(() => {
    setShowIngredienteForm(false)
  }, [])

  function handleStartEdit(recetaId: string, cantidadActual: string) {
    setEditingRecetaId(recetaId)
    setEditCantidad(cantidadActual)
  }

  function handleCancelEdit() {
    setEditingRecetaId(null)
    setEditCantidad('')
  }

  async function handleSaveEdit(recetaId: string) {
    const cantidadNum = parseFloat(editCantidad)
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    try {
      await actualizarCantidadReceta(recetaId, cantidadNum)
      toast.success('Cantidad actualizada')
      setEditingRecetaId(null)
      setEditCantidad('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    }
  }

  async function handleDelete(recetaId: string) {
    if (deletingId === recetaId) {
      try {
        await eliminarIngrediente(recetaId)
        toast.success('Ingrediente eliminado')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado'
        toast.error(message)
      }
      setDeletingId(null)
    } else {
      setDeletingId(recetaId)
      setTimeout(() => {
        setDeletingId((current) => (current === recetaId ? null : current))
      }, 3000)
    }
  }

  const servicioSeleccionado = servicios.find((s) => s.id === servicioId)

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Recetas (Lista de Materiales)</h2>

      {/* Selector de servicio */}
      <div className="mb-6">
        <label htmlFor="receta-servicio" className="block text-sm font-medium text-gray-700 mb-1">
          Seleccionar Servicio
        </label>
        <select
          id="receta-servicio"
          value={servicioId}
          onChange={(e) => {
            setServicioId(e.target.value)
            setShowIngredienteForm(false)
            setEditingRecetaId(null)
            setDeletingId(null)
          }}
          disabled={loadingServicios}
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{loadingServicios ? 'Cargando servicios...' : 'Seleccionar servicio'}</option>
          {servicios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.codigo} - {s.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Sin servicio seleccionado */}
      {!servicioId && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">Selecciona un servicio</p>
          <p className="text-sm mt-1">Elige un servicio para ver y gestionar sus ingredientes</p>
        </div>
      )}

      {/* Servicio seleccionado */}
      {servicioId && (
        <div>
          {/* Info del servicio */}
          {servicioSeleccionado && (
            <div className="bg-purple-50 border border-purple-200 rounded-md px-4 py-3 mb-4">
              <p className="text-sm font-medium text-purple-800">
                {servicioSeleccionado.codigo} - {servicioSeleccionado.nombre}
              </p>
              <p className="text-xs text-purple-600 mt-0.5">
                {recetas.length} {recetas.length === 1 ? 'ingrediente' : 'ingredientes'}
              </p>
            </div>
          )}

          {/* Boton agregar ingrediente */}
          {!showIngredienteForm && (
            <button
              onClick={() => setShowIngredienteForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors mb-4"
            >
              Agregar Ingrediente
            </button>
          )}

          {/* Formulario inline de ingrediente */}
          {showIngredienteForm && (
            <div className="mb-4">
              <IngredienteForm
                servicioId={servicioId}
                existingProductIds={existingProductIds}
                onSuccess={handleIngredienteSuccess}
              />
              <button
                onClick={() => setShowIngredienteForm(false)}
                className="mt-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Lista de ingredientes */}
          {loadingRecetas || loadingProductos ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : recetas.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border border-dashed border-gray-300 rounded-lg">
              <p className="text-sm font-medium">Sin ingredientes</p>
              <p className="text-xs mt-1">Agrega productos que este servicio consume al venderse</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-700">Producto</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-700">Cantidad</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {recetas.map((receta) => {
                    const producto = productoMap.get(receta.producto_id)
                    const isEditing = editingRecetaId === receta.id
                    const isConfirmingDelete = deletingId === receta.id

                    return (
                      <tr key={receta.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-900">
                          {producto ? (
                            <>
                              <span className="font-mono text-gray-500 text-xs">{producto.codigo}</span>
                              <span className="mx-1.5 text-gray-300">|</span>
                              {producto.nombre}
                            </>
                          ) : (
                            <span className="text-gray-400">Producto no encontrado</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={editCantidad}
                              onChange={(e) => setEditCantidad(e.target.value)}
                              autoFocus
                              className="w-24 rounded-md border border-blue-400 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(receta.id)
                                if (e.key === 'Escape') handleCancelEdit()
                              }}
                            />
                          ) : (
                            <span className="font-medium text-gray-900">
                              {parseFloat(receta.cantidad).toFixed(3)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleSaveEdit(receta.id)}
                                  className="inline-flex items-center p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                  title="Guardar"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="inline-flex items-center p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                                  title="Cancelar"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleStartEdit(receta.id, receta.cantidad)}
                                  className="inline-flex items-center p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                                  title="Editar cantidad"
                                >
                                  <PencilSimple className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(receta.id)}
                                  className={`inline-flex items-center p-1.5 rounded transition-colors ${
                                    isConfirmingDelete
                                      ? 'text-white bg-red-600 hover:bg-red-700'
                                      : 'text-gray-500 hover:bg-red-50 hover:text-red-600'
                                  }`}
                                  title={isConfirmingDelete ? 'Confirmar eliminacion' : 'Eliminar'}
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
