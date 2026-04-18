import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { Trash2, Check, X, Pencil } from 'lucide-react'
import { type Producto, actualizarProducto } from '@/features/inventario/hooks/use-productos'
import {
  useRecetasPorServicio,
  agregarIngrediente,
  actualizarCantidadReceta,
  eliminarIngrediente,
  recalcularCostoCombo,
  type Receta,
} from '@/features/inventario/hooks/use-recetas'
import { useProductosTipo } from '@/features/inventario/hooks/use-productos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatUsd } from '@/lib/currency'

interface ComboDetalleModalProps {
  combo: Producto | null
  onClose: () => void
}

export function ComboDetalleModal({ combo, onClose }: ComboDetalleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { user } = useCurrentUser()

  const { recetas, isLoading: loadingRecetas } = useRecetasPorServicio(combo?.id ?? '')
  const { productos: productosP } = useProductosTipo('P')

  const [editingRecetaId, setEditingRecetaId] = useState<string | null>(null)
  const [editCantidad, setEditCantidad] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addProductoId, setAddProductoId] = useState('')
  const [addCantidad, setAddCantidad] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)

  useEffect(() => {
    if (combo) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [combo])

  const productoMap = useMemo(() => {
    const map = new Map<string, { nombre: string; codigo: string; costo_usd: string; stock: string }>()
    for (const p of productosP) {
      map.set(p.id, { nombre: p.nombre, codigo: p.codigo, costo_usd: p.costo_usd, stock: p.stock })
    }
    return map
  }, [productosP])

  const existingProductIds = useMemo(() => recetas.map((r) => r.producto_id), [recetas])

  const productosDisponibles = useMemo(
    () => productosP.filter((p) => !existingProductIds.includes(p.id)),
    [productosP, existingProductIds]
  )

  const costoTotal = useMemo(() => {
    return recetas.reduce((sum, r) => {
      const prod = productoMap.get(r.producto_id)
      return sum + (prod ? parseFloat(prod.costo_usd) * parseFloat(r.cantidad) : 0)
    }, 0)
  }, [recetas, productoMap])

  const pvp = combo ? parseFloat(combo.precio_venta_usd) : 0
  const margen = pvp > 0 ? ((pvp - costoTotal) / pvp) * 100 : 0

  async function handleSaveEdit(recetaId: string) {
    const cantidadNum = parseFloat(editCantidad)
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }
    try {
      await actualizarCantidadReceta(recetaId, cantidadNum)
      // Recalcular costo del combo con las recetas actualizadas
      const recetasActualizadas = recetas.map((r) =>
        r.id === recetaId ? { ...r, cantidad: cantidadNum.toFixed(3) } : r
      )
      if (combo) {
        await recalcularCostoCombo(combo.id, recetasActualizadas as Receta[], productoMap)
      }
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
        const recetasRestantes = recetas.filter((r) => r.id !== recetaId)
        if (combo) {
          await recalcularCostoCombo(combo.id, recetasRestantes, productoMap)
        }
        toast.success('Componente eliminado')
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

  const handleIngredienteAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!addProductoId || !combo) return
      const cantidadNum = parseFloat(addCantidad)
      if (isNaN(cantidadNum) || cantidadNum <= 0) {
        toast.error('La cantidad debe ser mayor a 0')
        return
      }
      setAddSubmitting(true)
      try {
        await agregarIngrediente(combo.id, addProductoId, cantidadNum, user!.empresa_id!)
        const nuevasRecetas = [
          ...recetas,
          { id: '', servicio_id: combo.id, producto_id: addProductoId, cantidad: cantidadNum.toFixed(3), created_at: '' },
        ]
        await recalcularCostoCombo(combo.id, nuevasRecetas as Receta[], productoMap)
        toast.success('Componente agregado')
        setAddProductoId('')
        setAddCantidad('')
        setShowAddForm(false)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado'
        toast.error(message)
      } finally {
        setAddSubmitting(false)
      }
    },
    [addProductoId, addCantidad, combo, recetas, productoMap, user]
  )

  async function handleToggleActivo() {
    if (!combo) return
    try {
      await actualizarProducto(combo.id, { is_active: combo.is_active !== 1 })
      toast.success(combo.is_active === 1 ? 'Combo desactivado' : 'Combo activado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  if (!combo) return null

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        {/* Encabezado */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-500">{combo.codigo}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                combo.is_active === 1
                  ? 'bg-green-50 text-green-700 ring-green-600/20'
                  : 'bg-gray-100 text-gray-500 ring-gray-400/20'
              }`}>
                {combo.is_active === 1 ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mt-1">{combo.nombre}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resumen financiero */}
        <div className="grid grid-cols-3 gap-3 mb-5 bg-gray-50 rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-gray-500">Costo Total</p>
            <p className="font-semibold text-gray-900">{formatUsd(costoTotal)}</p>
          </div>
          <div className="text-center border-x border-gray-200">
            <p className="text-xs text-gray-500">Precio Venta</p>
            <p className="font-semibold text-gray-900">{formatUsd(pvp)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Margen</p>
            <p className={`font-semibold ${margen >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {margen.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Tabla de componentes */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Componentes ({recetas.length})</h3>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                + Agregar componente
              </button>
            )}
          </div>

          {/* Formulario agregar */}
          {showAddForm && (
            <form onSubmit={handleIngredienteAdd} className="flex flex-col sm:flex-row items-end gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200 mb-3">
              <div className="flex-1 w-full">
                <label className="block text-xs font-medium text-gray-700 mb-1">Producto</label>
                <select
                  value={addProductoId}
                  onChange={(e) => setAddProductoId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar</option>
                  {productosDisponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} - {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-24">
                <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={addCantidad}
                  onChange={(e) => setAddCantidad(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="submit"
                  disabled={addSubmitting || !addProductoId || !addCantidad}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {addSubmitting ? '...' : 'Agregar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setAddProductoId(''); setAddCantidad('') }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {loadingRecetas ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : recetas.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border border-dashed border-gray-300 rounded-lg">
              <p className="text-sm font-medium">Sin componentes</p>
              <p className="text-xs mt-1">Agrega productos que forman parte de este combo</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Producto</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Cantidad</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Costo Unit.</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Subtotal</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {recetas.map((receta) => {
                    const prod = productoMap.get(receta.producto_id)
                    const isEditingRow = editingRecetaId === receta.id
                    const isConfirmingDelete = deletingId === receta.id
                    const cantidadNum = parseFloat(receta.cantidad)
                    const costoUnit = prod ? parseFloat(prod.costo_usd) : 0
                    const subtotal = costoUnit * cantidadNum

                    return (
                      <tr key={receta.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-gray-900">
                          {prod ? (
                            <>
                              <span className="font-mono text-gray-400 text-xs">{prod.codigo}</span>
                              <span className="mx-1 text-gray-300">|</span>
                              {prod.nombre}
                            </>
                          ) : (
                            <span className="text-gray-400">No encontrado</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isEditingRow ? (
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={editCantidad}
                              onChange={(e) => setEditCantidad(e.target.value)}
                              autoFocus
                              className="w-20 rounded-md border border-blue-400 px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(receta.id)
                                if (e.key === 'Escape') { setEditingRecetaId(null); setEditCantidad('') }
                              }}
                            />
                          ) : (
                            <span className="font-medium text-gray-900">{cantidadNum.toFixed(3)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {formatUsd(costoUnit)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {formatUsd(subtotal)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isEditingRow ? (
                              <>
                                <button
                                  onClick={() => handleSaveEdit(receta.id)}
                                  className="inline-flex items-center p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                  title="Guardar"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => { setEditingRecetaId(null); setEditCantidad('') }}
                                  className="inline-flex items-center p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                                  title="Cancelar"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => { setEditingRecetaId(receta.id); setEditCantidad(receta.cantidad) }}
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
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50">
                    <td colSpan={3} className="px-3 py-2 text-right text-sm font-medium text-gray-700">
                      Costo Total:
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900">
                      {formatUsd(costoTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Acciones inferiores */}
        <div className="flex justify-between items-center pt-3 border-t border-gray-200">
          <button
            onClick={handleToggleActivo}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              combo.is_active === 1
                ? 'text-red-700 bg-red-50 hover:bg-red-100'
                : 'text-green-700 bg-green-50 hover:bg-green-100'
            }`}
          >
            {combo.is_active === 1 ? 'Desactivar combo' : 'Activar combo'}
          </button>
          <button
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
