import { useState } from 'react'
import { Plus, Eye } from 'lucide-react'
import { useCompras } from '@/features/inventario/hooks/use-compras'
import { formatUsd, formatBs } from '@/lib/currency'
import { CompraForm } from './compra-form'
import { CompraDetalleModal } from './compra-detalle-modal'

export function CompraList() {
  const { compras, isLoading } = useCompras()
  const [showForm, setShowForm] = useState(false)
  const [detalleCompraId, setDetalleCompraId] = useState<string | null>(null)

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
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Historial de Compras
          <span className="text-sm font-normal text-gray-500 ml-2">({compras.length})</span>
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva Compra
        </button>
      </div>

      {compras.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg font-medium">Sin compras registradas</p>
          <p className="text-sm mt-1">Haz clic en "Nueva Compra" para registrar una orden de compra</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nro</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total USD</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Bs</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tasa</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {compras.map((compra) => (
                <tr key={compra.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm text-gray-900">{compra.nro_factura}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(compra.fecha).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{compra.proveedor_nombre}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                    {formatUsd(compra.total_usd)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">
                    {formatBs(compra.total_bs)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {parseFloat(compra.tasa).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setDetalleCompraId(compra.id)}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CompraForm isOpen={showForm} onClose={() => setShowForm(false)} />

      {detalleCompraId && (
        <CompraDetalleModal
          compraId={detalleCompraId}
          isOpen={!!detalleCompraId}
          onClose={() => setDetalleCompraId(null)}
        />
      )}
    </div>
  )
}
