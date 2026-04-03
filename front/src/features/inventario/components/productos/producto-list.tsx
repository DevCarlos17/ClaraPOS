import { useState, useMemo } from 'react'
import { Plus, Pencil, DollarSign, AlertTriangle } from 'lucide-react'
import {
  useProductos,
  useResumenInventario,
  type Producto,
} from '@/features/inventario/hooks/use-productos'
import { useDepartamentos } from '@/features/inventario/hooks/use-departamentos'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { PrecioDisplay } from './precio-display'
import { ProductoForm } from './producto-form'

export function ProductoList() {
  const { productos, isLoading } = useProductos()
  const { departamentos } = useDepartamentos()
  const { tasaValor } = useTasaActual()
  const { valorTotal, stockCritico } = useResumenInventario()

  const [formOpen, setFormOpen] = useState(false)
  const [editingProducto, setEditingProducto] = useState<Producto | undefined>(undefined)

  // Filtros
  const [filtroDepartamento, setFiltroDepartamento] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'P' | 'S' | ''>('')
  const [filtroActivo, setFiltroActivo] = useState(true)

  const departamentoMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const dep of departamentos) {
      map.set(dep.id, dep.nombre)
    }
    return map
  }, [departamentos])

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      if (filtroActivo && p.activo !== 1) return false
      if (!filtroActivo && p.activo === 1) return false
      if (filtroDepartamento && p.departamento_id !== filtroDepartamento) return false
      if (filtroTipo && p.tipo !== filtroTipo) return false
      return true
    })
  }, [productos, filtroDepartamento, filtroTipo, filtroActivo])

  function handleNuevo() {
    setEditingProducto(undefined)
    setFormOpen(true)
  }

  function handleEditar(producto: Producto) {
    setEditingProducto(producto)
    setFormOpen(true)
  }

  function handleCloseForm() {
    setFormOpen(false)
    setEditingProducto(undefined)
  }

  function isStockBajo(producto: Producto): boolean {
    if (producto.tipo === 'S') return false
    const stock = parseFloat(producto.stock)
    const minimo = parseFloat(producto.stock_minimo)
    return minimo > 0 && stock < minimo
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="h-10 w-full bg-gray-100 rounded animate-pulse" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <DollarSign className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Valor Total Inventario</p>
            <p className="text-lg font-semibold text-gray-900">{formatUsd(valorTotal)}</p>
            {tasaValor > 0 && (
              <p className="text-xs text-gray-400">{formatBs(usdToBs(valorTotal, tasaValor))}</p>
            )}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
            stockCritico > 0 ? 'bg-red-100' : 'bg-gray-100'
          }`}>
            <AlertTriangle className={`h-5 w-5 ${stockCritico > 0 ? 'text-red-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Stock Critico</p>
            <p className={`text-lg font-semibold ${stockCritico > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {stockCritico} {stockCritico === 1 ? 'producto' : 'productos'}
            </p>
          </div>
        </div>
      </div>

      {/* Barra de filtros y accion */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={filtroDepartamento}
            onChange={(e) => setFiltroDepartamento(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los departamentos</option>
            {departamentos.map((dep) => (
              <option key={dep.id} value={dep.id}>
                {dep.nombre}
              </option>
            ))}
          </select>

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as 'P' | 'S' | '')}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los tipos</option>
            <option value="P">Productos</option>
            <option value="S">Servicios</option>
          </select>

          <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={filtroActivo}
              onChange={(e) => setFiltroActivo(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Solo activos
          </label>
        </div>

        <button
          onClick={handleNuevo}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo Producto
        </button>
      </div>

      {/* Tabla */}
      {productosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No se encontraron productos</p>
          <p className="text-sm mt-1">Ajusta los filtros o crea un nuevo producto</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Codigo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Departamento</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Costo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Precio Venta</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Stock</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((prod) => {
                const stockBajo = isStockBajo(prod)
                return (
                  <tr key={prod.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-900">{prod.codigo}</td>
                    <td className="px-4 py-3">
                      {prod.tipo === 'P' ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset">
                          Producto
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-purple-600/20 ring-inset">
                          Servicio
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{prod.nombre}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {departamentoMap.get(prod.departamento_id) ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PrecioDisplay usd={prod.costo_usd} tasa={tasaValor} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PrecioDisplay usd={prod.precio_venta_usd} tasa={tasaValor} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {prod.tipo === 'S' ? (
                        <span className="text-gray-400">N/A</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={stockBajo ? 'text-red-600 font-medium' : 'text-gray-900'}>
                            {parseFloat(prod.stock).toFixed(prod.medida === 'GRA' ? 3 : 0)}
                          </span>
                          {stockBajo && (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-red-600/20 ring-inset">
                              BAJO
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEditar(prod)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProductoForm
        isOpen={formOpen}
        onClose={handleCloseForm}
        producto={editingProducto}
      />
    </div>
  )
}
