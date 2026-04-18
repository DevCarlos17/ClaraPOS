import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { type Producto } from '@/features/inventario/hooks/use-productos'
import {
  useRecetasPorServicio,
  actualizarCantidadReceta,
  eliminarIngrediente,
} from '@/features/inventario/hooks/use-recetas'
import { useProductosTipo } from '@/features/inventario/hooks/use-productos'
import { IngredienteForm } from './ingrediente-form'
import { formatUsd } from '@/lib/currency'

interface ServicioDetalleModalProps {
  servicio: Producto | null
  onClose: () => void
}

export function ServicioDetalleModal({ servicio, onClose }: ServicioDetalleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isOpen = servicio !== null

  const { productos: productosP, isLoading: loadingProductos } = useProductosTipo('P')
  const { recetas, isLoading: loadingRecetas } = useRecetasPorServicio(servicio?.id ?? '')

  const [showIngredienteForm, setShowIngredienteForm] = useState(false)
  const [editingRecetaId, setEditingRecetaId] = useState<string | null>(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setShowIngredienteForm(false)
      setEditingRecetaId(null)
      setDeletingId(null)
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  const productoMap = useMemo(() => {
    const map = new Map<string, { nombre: string; codigo: string; costo_usd: string }>()
    for (const p of productosP) {
      map.set(p.id, { nombre: p.nombre, codigo: p.codigo, costo_usd: p.costo_usd })
    }
    return map
  }, [productosP])

  const existingProductIds = useMemo(() => recetas.map((r) => r.producto_id), [recetas])

  const costoTotal = useMemo(() => {
    return recetas.reduce((sum, r) => {
      const prod = productoMap.get(r.producto_id)
      return sum + (prod ? parseFloat(prod.costo_usd) * parseFloat(r.cantidad) : 0)
    }, 0)
  }, [recetas, productoMap])

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
      toast.error(error instanceof Error ? error.message : 'Error inesperado')
    }
  }

  async function handleDelete(recetaId: string) {
    if (deletingId === recetaId) {
      try {
        await eliminarIngrediente(recetaId)
        toast.success('Ingrediente eliminado')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error inesperado')
      }
      setDeletingId(null)
    } else {
      setDeletingId(recetaId)
      setTimeout(() => {
        setDeletingId((current) => (current === recetaId ? null : current))
      }, 3000)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  if (!servicio) return null

  const pvp = parseFloat(servicio.precio_venta_usd)
  const margen = pvp > 0 ? ((pvp - costoTotal) / pvp * 100) : 0

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        {/* Header del servicio */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              <span className="font-mono text-purple-600 text-sm">{servicio.codigo}</span>
              <span className="mx-2 text-gray-300">|</span>
              {servicio.nombre}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Gestion de ingredientes / insumos</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-4"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resumen de costos */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-gray-50 rounded-md px-3 py-2">
            <p className="text-xs text-gray-500">Costo Insumos</p>
            <p className="text-sm font-semibold text-gray-900">{formatUsd(costoTotal)}</p>
          </div>
          <div className="bg-gray-50 rounded-md px-3 py-2">
            <p className="text-xs text-gray-500">Precio Venta</p>
            <p className="text-sm font-semibold text-gray-900">{formatUsd(pvp)}</p>
          </div>
          <div className="bg-gray-50 rounded-md px-3 py-2">
            <p className="text-xs text-gray-500">Margen</p>
            <p className={`text-sm font-semibold ${margen >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {margen.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Boton agregar */}
        {!showIngredienteForm && (
          <button
            onClick={() => setShowIngredienteForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors mb-4"
          >
            Agregar Ingrediente
          </button>
        )}

        {/* Formulario inline */}
        {showIngredienteForm && (
          <div className="mb-4">
            <IngredienteForm
              servicioId={servicio.id}
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
            <p className="text-xs mt-1">Agrega los insumos que este servicio consume al venderse</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Insumo</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Costo Unit.</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Cantidad</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Subtotal</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {recetas.map((receta) => {
                  const producto = productoMap.get(receta.producto_id)
                  const isEditing = editingRecetaId === receta.id
                  const isConfirmingDelete = deletingId === receta.id
                  const cantNum = parseFloat(receta.cantidad)
                  const costoUnit = producto ? parseFloat(producto.costo_usd) : 0
                  const subtotal = costoUnit * cantNum

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
                      <td className="px-4 py-3 text-right text-gray-600 text-xs">
                        {formatUsd(costoUnit)}
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
                            {cantNum.toFixed(3)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 text-xs">
                        {formatUsd(subtotal)}
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
                                <Pencil className="h-3.5 w-3.5" />
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
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {recetas.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={3} className="px-4 py-2 text-right text-sm font-semibold text-gray-700">
                      Costo Total Insumos:
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900">
                      {formatUsd(costoTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  )
}
