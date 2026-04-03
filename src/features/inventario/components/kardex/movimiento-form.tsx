import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { kardexSchema } from '@/features/inventario/schemas/kardex-schema'
import { useProductosTipo } from '@/features/inventario/hooks/use-productos'
import { registrarMovimiento } from '@/features/inventario/hooks/use-kardex'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface MovimientoFormProps {
  isOpen: boolean
  onClose: () => void
}

export function MovimientoForm({ isOpen, onClose }: MovimientoFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { productos, isLoading: loadingProductos } = useProductosTipo('P')
  const { user } = useCurrentUser()

  const [productoId, setProductoId] = useState('')
  const [tipo, setTipo] = useState<'E' | 'S'>('E')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo.toLowerCase().includes(busqueda.toLowerCase())
  )

  const productoSeleccionado = productos.find((p) => p.id === productoId)

  useEffect(() => {
    if (isOpen) {
      setProductoId('')
      setTipo('E')
      setCantidad('')
      setMotivo('')
      setBusqueda('')
      setDropdownOpen(false)
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleSelectProducto(id: string, nombre: string) {
    setProductoId(id)
    setBusqueda(nombre)
    setDropdownOpen(false)
  }

  function handleBusquedaChange(value: string) {
    setBusqueda(value)
    setDropdownOpen(true)
    if (!value) setProductoId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    const cantidadNum = parseFloat(cantidad)
    const parsed = kardexSchema.safeParse({
      producto_id: productoId,
      tipo,
      cantidad: isNaN(cantidadNum) ? 0 : cantidadNum,
      motivo: motivo.trim() || undefined,
    })

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSubmitting(true)
    try {
      await registrarMovimiento({
        producto_id: parsed.data.producto_id,
        tipo: parsed.data.tipo,
        cantidad: parsed.data.cantidad,
        motivo: parsed.data.motivo,
        usuario_id: user.id,
      })
      toast.success(
        tipo === 'E'
          ? `Entrada de ${parsed.data.cantidad} registrada`
          : `Salida de ${parsed.data.cantidad} registrada`
      )
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Nuevo Movimiento de Inventario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Producto (buscador) */}
          <div className="relative">
            <label htmlFor="mov-producto" className="block text-sm font-medium text-gray-700 mb-1">
              Producto
            </label>
            <input
              id="mov-producto"
              type="text"
              value={busqueda}
              onChange={(e) => handleBusquedaChange(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              placeholder={loadingProductos ? 'Cargando productos...' : 'Buscar producto por nombre o codigo'}
              disabled={loadingProductos}
              autoComplete="off"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.producto_id ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.producto_id && (
              <p className="text-red-500 text-xs mt-1">{errors.producto_id}</p>
            )}

            {dropdownOpen && busqueda && productosFiltrados.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                {productosFiltrados.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectProducto(p.id, `${p.codigo} - ${p.nombre}`)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                    >
                      <span className="font-mono text-gray-500">{p.codigo}</span>
                      <span className="mx-1.5 text-gray-300">|</span>
                      <span className="text-gray-900">{p.nombre}</span>
                      <span className="text-gray-400 text-xs ml-2">Stock: {parseFloat(p.stock).toFixed(3)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {dropdownOpen && busqueda && productosFiltrados.length === 0 && !loadingProductos && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg p-3 text-sm text-gray-500">
                No se encontraron productos
              </div>
            )}
          </div>

          {/* Info de producto seleccionado */}
          {productoSeleccionado && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              Stock actual: <span className="font-medium text-gray-700">{parseFloat(productoSeleccionado.stock).toFixed(3)}</span>
              {' '}{productoSeleccionado.medida}
            </div>
          )}

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Movimiento</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTipo('E')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors border ${
                  tipo === 'E'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-green-50'
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setTipo('S')}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors border ${
                  tipo === 'S'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-red-50'
                }`}
              >
                Salida
              </button>
            </div>
            {errors.tipo && <p className="text-red-500 text-xs mt-1">{errors.tipo}</p>}
          </div>

          {/* Cantidad */}
          <div>
            <label htmlFor="mov-cantidad" className="block text-sm font-medium text-gray-700 mb-1">
              Cantidad
            </label>
            <input
              id="mov-cantidad"
              type="number"
              step="0.001"
              min="0.001"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.cantidad ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.cantidad && <p className="text-red-500 text-xs mt-1">{errors.cantidad}</p>}
          </div>

          {/* Motivo */}
          <div>
            <label htmlFor="mov-motivo" className="block text-sm font-medium text-gray-700 mb-1">
              Motivo <span className="text-gray-400 font-normal">- Opcional</span>
            </label>
            <textarea
              id="mov-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Descripcion del motivo del ajuste"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 ${
                tipo === 'E'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {submitting
                ? 'Registrando...'
                : tipo === 'E'
                  ? 'Registrar Entrada'
                  : 'Registrar Salida'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
