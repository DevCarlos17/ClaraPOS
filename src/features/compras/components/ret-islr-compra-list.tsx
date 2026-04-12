import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useRetencionesIslrCompras, type RetencionIslr } from '@/features/compras/hooks/use-ret-islr-compras'
import { RetIslrCompraForm } from './ret-islr-compra-form'

type RetencionIslrConProveedor = RetencionIslr & { proveedor_nombre: string }

export function RetIslrCompraList() {
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const { retenciones, isLoading } = useRetencionesIslrCompras(
    fechaDesde || undefined,
    fechaHasta || undefined
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* Barra superior */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Retenciones ISLR
            <span className="text-sm font-normal text-gray-500 ml-2">({retenciones.length})</span>
          </h2>
          <div className="flex items-center gap-2">
            <label htmlFor="ret-islr-desde" className="text-sm text-gray-600 whitespace-nowrap">
              Desde
            </label>
            <input
              id="ret-islr-desde"
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="ret-islr-hasta" className="text-sm text-gray-600 whitespace-nowrap">
              Hasta
            </label>
            <input
              id="ret-islr-hasta"
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nueva Retencion
        </button>
      </div>

      {/* Contenido */}
      {retenciones.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay retenciones de ISLR registradas</p>
          <p className="text-sm mt-1">Haz clic en "Nueva Retencion" para registrar una retencion de ISLR</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Nro Comprobante</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Proveedor</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Base Imponible (Bs)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">% Ret.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Monto Retenido (Bs)</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {retenciones.map((ret: RetencionIslrConProveedor) => (
                <tr
                  key={ret.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(ret.fecha_comprobante).toLocaleDateString('es-VE')}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-900">{ret.nro_comprobante}</td>
                  <td className="px-4 py-3 text-gray-900">{ret.proveedor_nombre}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {parseFloat(ret.base_imponible_bs).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {parseFloat(ret.porcentaje_retencion).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {parseFloat(ret.monto_retenido_bs).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {ret.status === 'PENDIENTE' ? (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
                        PENDIENTE
                      </span>
                    ) : ret.status === 'DECLARADO' ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                        DECLARADO
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                        ANULADO
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RetIslrCompraForm isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  )
}
