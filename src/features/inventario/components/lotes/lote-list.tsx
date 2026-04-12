import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useProductos } from '@/features/inventario/hooks/use-productos'
import { useLotesPorProducto } from '@/features/inventario/hooks/use-lotes'
import { formatDate } from '@/lib/format'
import { LoteForm } from './lote-form'

type LoteStatus = 'ACTIVO' | 'AGOTADO' | 'VENCIDO'

function StatusBadge({ status }: { status: string }) {
  switch (status as LoteStatus) {
    case 'ACTIVO':
      return (
        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
          ACTIVO
        </span>
      )
    case 'AGOTADO':
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
          AGOTADO
        </span>
      )
    case 'VENCIDO':
      return (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
          VENCIDO
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
          {status}
        </span>
      )
  }
}

function LotesTable({ productoId }: { productoId: string }) {
  const { lotes, isLoading } = useLotesPorProducto(productoId)

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-10 bg-gray-100 rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (lotes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-base font-medium">No hay lotes registrados</p>
        <p className="text-sm mt-1">Crea el primer lote para este producto</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-3 font-medium text-gray-700">Nro Lote</th>
            <th className="text-left px-4 py-3 font-medium text-gray-700">Deposito</th>
            <th className="text-right px-4 py-3 font-medium text-gray-700">Cant. Inicial</th>
            <th className="text-right px-4 py-3 font-medium text-gray-700">Cant. Actual</th>
            <th className="text-right px-4 py-3 font-medium text-gray-700">Costo</th>
            <th className="text-left px-4 py-3 font-medium text-gray-700">F. Fabricacion</th>
            <th className="text-left px-4 py-3 font-medium text-gray-700">F. Vencimiento</th>
            <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
          </tr>
        </thead>
        <tbody>
          {lotes.map((lote) => (
            <tr key={lote.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-mono text-gray-900 font-medium">{lote.nro_lote}</td>
              <td className="px-4 py-3 text-gray-700">{lote.nombre_deposito ?? '-'}</td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                {parseFloat(lote.cantidad_inicial).toFixed(3)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                {parseFloat(lote.cantidad_actual).toFixed(3)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                {lote.costo_unitario != null ? `$${parseFloat(lote.costo_unitario).toFixed(2)}` : '-'}
              </td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                {lote.fecha_fabricacion ? formatDate(lote.fecha_fabricacion) : '-'}
              </td>
              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                {lote.fecha_vencimiento ? formatDate(lote.fecha_vencimiento) : '-'}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={lote.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LoteList() {
  const { productos, isLoading: loadingProductos } = useProductos()
  const [selectedProductoId, setSelectedProductoId] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  return (
    <div>
      {/* Selector de producto */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[260px]">
          <label htmlFor="lote-producto-sel" className="block text-sm font-medium text-gray-700 mb-1">
            Producto
          </label>
          <select
            id="lote-producto-sel"
            value={selectedProductoId}
            onChange={(e) => setSelectedProductoId(e.target.value)}
            disabled={loadingProductos}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Seleccione un producto --</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} - {p.nombre}
              </option>
            ))}
          </select>
        </div>

        {selectedProductoId && (
          <button
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nuevo Lote
          </button>
        )}
      </div>

      {/* Contenido */}
      {!selectedProductoId ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">Seleccione un producto para ver sus lotes</p>
        </div>
      ) : (
        <LotesTable productoId={selectedProductoId} />
      )}

      <LoteForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        productoId={selectedProductoId}
      />
    </div>
  )
}
