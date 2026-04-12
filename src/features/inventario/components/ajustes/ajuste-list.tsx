import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAjustes } from '@/features/inventario/hooks/use-ajustes'
import { formatDate } from '@/lib/format'
import { AjusteForm } from './ajuste-form'
import { AjusteDetalleModal } from './ajuste-detalle-modal'

function OperacionBadge({ operacion }: { operacion: string | null }) {
  if (operacion === 'SUMA') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        SUMA
      </span>
    )
  }
  if (operacion === 'NEUTRO') {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
        NEUTRO
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
      RESTA
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'BORRADOR':
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
          BORRADOR
        </span>
      )
    case 'APLICADO':
      return (
        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
          APLICADO
        </span>
      )
    case 'ANULADO':
      return (
        <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
          ANULADO
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

export function AjusteList() {
  const { ajustes, isLoading } = useAjustes()
  const [formOpen, setFormOpen] = useState(false)
  const [detalleAjusteId, setDetalleAjusteId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center mb-4">
          <div className="h-8 w-56 bg-gray-200 rounded animate-pulse" />
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
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Ajustes de Inventario</h2>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nuevo Ajuste
        </button>
      </div>

      {/* Tabla */}
      {ajustes.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-base font-medium">No hay ajustes registrados</p>
          <p className="text-sm mt-1">Crea el primer ajuste para comenzar</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Num Ajuste</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Motivo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Operacion</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {ajustes.map((ajuste) => (
                <tr
                  key={ajuste.id}
                  onClick={() => setDetalleAjusteId(ajuste.id)}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-gray-900 font-medium">
                    {ajuste.num_ajuste}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDate(ajuste.fecha)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{ajuste.nombre_motivo ?? '-'}</td>
                  <td className="px-4 py-3">
                    <OperacionBadge operacion={ajuste.operacion_base} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ajuste.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AjusteForm isOpen={formOpen} onClose={() => setFormOpen(false)} />

      {detalleAjusteId && (
        <AjusteDetalleModal
          isOpen={detalleAjusteId !== null}
          onClose={() => setDetalleAjusteId(null)}
          ajusteId={detalleAjusteId}
        />
      )}
    </div>
  )
}
