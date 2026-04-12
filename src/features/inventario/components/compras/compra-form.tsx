import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { compraHeaderSchema, lineaCompraSchema } from '@/features/inventario/schemas/compra-schema'
import { crearCompra, type LineaCompra } from '@/features/inventario/hooks/use-compras'
import { useProveedoresActivos } from '@/features/proveedores/hooks/use-proveedores'
import { useProductosTipo, type Producto } from '@/features/inventario/hooks/use-productos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatUsd, formatBs } from '@/lib/currency'

interface LineaUI extends LineaCompra {
  codigo: string
  nombre: string
}

interface CompraFormProps {
  isOpen: boolean
  onClose: () => void
}

export function CompraForm({ isOpen, onClose }: CompraFormProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { proveedores, isLoading: loadingProveedores } = useProveedoresActivos()
  const { productos, isLoading: loadingProductos } = useProductosTipo('P')
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()

  const [proveedorId, setProveedorId] = useState('')
  const [tasa, setTasa] = useState('')
  const [lineas, setLineas] = useState<LineaUI[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Buscador de productos
  const [busqueda, setBusqueda] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const productosFiltrados = productos.filter(
    (p) =>
      !lineas.some((l) => l.producto_id === p.id) &&
      (p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo.toLowerCase().includes(busqueda.toLowerCase()))
  )

  const totalUsd = lineas.reduce((sum, l) => sum + l.cantidad * l.costo_unitario_usd, 0)
  const tasaNum = parseFloat(tasa) || 0
  const totalBs = totalUsd * tasaNum

  useEffect(() => {
    if (isOpen) {
      setProveedorId('')
      setTasa(tasaValor > 0 ? tasaValor.toFixed(4) : '')
      setLineas([])
      setBusqueda('')
      setDropdownOpen(false)
      setErrors({})
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen, tasaValor])

  function handleAddProducto(producto: Producto) {
    setLineas((prev) => [
      ...prev,
      {
        producto_id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        cantidad: 1,
        costo_unitario_usd: parseFloat(producto.costo_usd) || 0,
      },
    ])
    setBusqueda('')
    setDropdownOpen(false)
  }

  function handleRemoveLinea(index: number) {
    setLineas((prev) => prev.filter((_, i) => i !== index))
  }

  function handleLineaChange(index: number, field: 'cantidad' | 'costo_unitario_usd', value: string) {
    setLineas((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const num = parseFloat(value)
        return { ...l, [field]: isNaN(num) || num < 0 ? 0 : num }
      })
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    if (!user) {
      toast.error('No se pudo identificar el usuario')
      return
    }

    // Validar header
    const headerParsed = compraHeaderSchema.safeParse({
      proveedor_id: proveedorId,
      tasa: tasaNum,
    })

    if (!headerParsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of headerParsed.error.issues) {
        const field = issue.path[0]?.toString()
        if (field) fieldErrors[field] = issue.message
      }
      setErrors(fieldErrors)
      return
    }

    // Validar que haya al menos 1 linea
    if (lineas.length === 0) {
      setErrors({ lineas: 'Debe agregar al menos un producto' })
      return
    }

    // Validar cada linea
    for (let i = 0; i < lineas.length; i++) {
      const lineaParsed = lineaCompraSchema.safeParse(lineas[i])
      if (!lineaParsed.success) {
        const msg = lineaParsed.error.issues[0]?.message ?? 'Error en linea'
        setErrors({ lineas: `Linea ${i + 1} (${lineas[i].nombre}): ${msg}` })
        return
      }
    }

    setSubmitting(true)
    try {
      const result = await crearCompra({
        proveedor_id: headerParsed.data.proveedor_id,
        tasa: headerParsed.data.tasa,
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          costo_unitario_usd: l.costo_unitario_usd,
        })),
        usuario_id: user.id,
        empresa_id: user.empresa_id!,
      })
      toast.success(`Compra ${result.nroFactura} registrada exitosamente`)
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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Nueva Compra</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Proveedor */}
          <div>
            <label htmlFor="compra-proveedor" className="block text-sm font-medium text-gray-700 mb-1">
              Proveedor
            </label>
            <select
              id="compra-proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              disabled={loadingProveedores}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.proveedor_id ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">
                {loadingProveedores ? 'Cargando...' : 'Seleccionar proveedor'}
              </option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rif} - {p.razon_social}
                </option>
              ))}
            </select>
            {errors.proveedor_id && <p className="text-red-500 text-xs mt-1">{errors.proveedor_id}</p>}
          </div>

          {/* Tasa */}
          <div>
            <label htmlFor="compra-tasa" className="block text-sm font-medium text-gray-700 mb-1">
              Tasa de Cambio (Bs/USD)
            </label>
            <input
              id="compra-tasa"
              type="number"
              step="0.0001"
              min="0.0001"
              value={tasa}
              onChange={(e) => setTasa(e.target.value)}
              placeholder="0.0000"
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.tasa ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.tasa && <p className="text-red-500 text-xs mt-1">{errors.tasa}</p>}
          </div>

          {/* Buscador de productos */}
          <div className="relative">
            <label htmlFor="compra-buscar" className="block text-sm font-medium text-gray-700 mb-1">
              Agregar Producto
            </label>
            <div className="flex gap-2">
              <input
                id="compra-buscar"
                type="text"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value)
                  setDropdownOpen(true)
                }}
                onFocus={() => busqueda && setDropdownOpen(true)}
                placeholder={loadingProductos ? 'Cargando productos...' : 'Buscar por nombre o codigo...'}
                disabled={loadingProductos}
                autoComplete="off"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {dropdownOpen && busqueda && productosFiltrados.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                {productosFiltrados.slice(0, 10).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleAddProducto(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2"
                    >
                      <Plus className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <span className="font-mono text-gray-500">{p.codigo}</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-900">{p.nombre}</span>
                      <span className="text-gray-400 text-xs ml-auto">
                        Costo: {formatUsd(p.costo_usd)}
                      </span>
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

          {/* Tabla de lineas */}
          {lineas.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Codigo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">Cantidad</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-32">Costo USD</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-16"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {lineas.map((linea, index) => {
                    const subtotal = linea.cantidad * linea.costo_unitario_usd
                    return (
                      <tr key={linea.producto_id}>
                        <td className="px-3 py-2 text-sm font-mono text-gray-500">{linea.codigo}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{linea.nombre}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={linea.cantidad || ''}
                            onChange={(e) => handleLineaChange(index, 'cantidad', e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={linea.costo_unitario_usd || ''}
                            onChange={(e) => handleLineaChange(index, 'costo_unitario_usd', e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-medium text-gray-900">
                          {formatUsd(subtotal)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLinea(index)}
                            className="text-red-500 hover:text-red-700 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {errors.lineas && <p className="text-red-500 text-xs">{errors.lineas}</p>}

          {/* Totales */}
          {lineas.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total USD:</span>
                <span className="font-semibold text-gray-900">{formatUsd(totalUsd)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Bs:</span>
                <span className="font-semibold text-gray-900">{formatBs(totalBs)}</span>
              </div>
            </div>
          )}

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
              disabled={submitting || lineas.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Registrando...' : 'Confirmar Compra'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
