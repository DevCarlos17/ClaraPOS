import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { useProductosTipo } from '@/features/inventario/hooks/use-productos'
import { agregarIngrediente } from '@/features/inventario/hooks/use-recetas'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface IngredienteFormProps {
  servicioId: string
  existingProductIds: string[]
  onSuccess: () => void
}

export function IngredienteForm({ servicioId, existingProductIds, onSuccess }: IngredienteFormProps) {
  const { productos, isLoading } = useProductosTipo('P')
  const { user } = useCurrentUser()
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const productosDisponibles = productos.filter(
    (p) => !existingProductIds.includes(p.id)
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!productoId) {
      toast.error('Selecciona un producto')
      return
    }

    const cantidadNum = parseFloat(cantidad)
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      toast.error('La cantidad debe ser mayor a 0')
      return
    }

    setSubmitting(true)
    try {
      await agregarIngrediente(servicioId, productoId, cantidadNum, user!.empresa_id!)
      toast.success('Ingrediente agregado correctamente')
      setProductoId('')
      setCantidad('')
      onSuccess()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-end gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex-1 w-full">
        <label htmlFor="ing-producto" className="block text-sm font-medium text-gray-700 mb-1">
          Producto
        </label>
        <select
          id="ing-producto"
          value={productoId}
          onChange={(e) => setProductoId(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{isLoading ? 'Cargando...' : 'Seleccionar producto'}</option>
          {productosDisponibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.codigo} - {p.nombre}
            </option>
          ))}
        </select>
        {productosDisponibles.length === 0 && !isLoading && (
          <p className="text-xs text-gray-400 mt-1">No hay mas productos disponibles para agregar</p>
        )}
      </div>

      <div className="w-full sm:w-32">
        <label htmlFor="ing-cantidad" className="block text-sm font-medium text-gray-700 mb-1">
          Cantidad
        </label>
        <input
          id="ing-cantidad"
          type="number"
          step="0.001"
          min="0.001"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          placeholder="0"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !productoId || !cantidad}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0"
      >
        <Plus className="h-4 w-4" />
        {submitting ? 'Agregando...' : 'Agregar'}
      </button>
    </form>
  )
}
