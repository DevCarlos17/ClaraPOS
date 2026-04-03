import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useMovimientos } from '@/features/inventario/hooks/use-kardex'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { formatDateTime } from '@/lib/format'
import { MovimientoForm } from './movimiento-form'

export function KardexList() {
  const { movimientos, isLoading } = useMovimientos()
  const { productos } = useProductos()
  const [formOpen, setFormOpen] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState<'E' | 'S' | ''>('')

  const productoMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of productos) {
      map.set(p.id, `${p.codigo} - ${p.nombre}`)
    }
    return map
  }, [productos])

  const movimientosFiltrados = useMemo(() => {
    if (!filtroTipo) return movimientos
    return movimientos.filter((m) => m.tipo === filtroTipo)
  }, [movimientos, filtroTipo])

  function origenLabel(origen: string): string {
    switch (origen) {
      case 'MAN':
        return 'Manual'
      case 'VEN':
        return 'Venta'
      case 'ANU':
        return 'Anulacion'
      default:
        return origen
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Barra superior */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Kardex de Inventario</h2>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as 'E' | 'S' | '')}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los tipos</option>
            <option value="E">Entradas</option>
            <option value="S">Salidas</option>
          </select>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo Movimiento
        </button>
      </div>

      {/* Tabla */}
      {movimientosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay movimientos registrados</p>
          <p className="text-sm mt-1">Los movimientos de inventario apareceran aqui</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Origen</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Cantidad</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Stock</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movimientosFiltrados.map((mov) => (
                <tr key={mov.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDateTime(mov.fecha)}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {productoMap.get(mov.producto_id) ?? mov.producto_id}
                  </td>
                  <td className="px-4 py-3">
                    {mov.tipo === 'E' ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        ENTRADA
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                        SALIDA
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{origenLabel(mov.origen)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {parseFloat(mov.cantidad).toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {parseFloat(mov.stock_anterior).toFixed(3)}
                    <span className="mx-1 text-gray-400">&rarr;</span>
                    {parseFloat(mov.stock_nuevo).toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                    {mov.motivo ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MovimientoForm isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
