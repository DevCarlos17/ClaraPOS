import { useEffect, useRef, useState } from 'react'
import { formatDateTime } from '@/lib/format'
import { useMovimientosPeriodo } from '../hooks/use-inventario-reportes'

const LIMITS = [
  { label: '10 movimientos', value: 10 },
  { label: '50 movimientos', value: 50 },
  { label: '100 movimientos', value: 100 },
]

function origenLabel(origen: string): string {
  switch (origen) {
    case 'MAN': return 'Manual'
    case 'VEN': return 'Venta'
    case 'COM': return 'Compra'
    case 'ANU': return 'Anulacion'
    case 'AJU': return 'Ajuste'
    case 'NCR': return 'Nota Credito'
    default: return origen
  }
}

interface InventarioMovimientosModalProps {
  isOpen: boolean
  onClose: () => void
  fechaDesde: string
  fechaHasta: string
}

export function InventarioMovimientosModal({ isOpen, onClose, fechaDesde, fechaHasta }: InventarioMovimientosModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [limit, setLimit] = useState(50)
  const { movimientos, isLoading } = useMovimientosPeriodo(fechaDesde, fechaHasta, limit)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl"
    >
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Movimientos del Periodo</h2>
            <p className="text-xs text-gray-500 mt-0.5">{fechaDesde} — {fechaHasta}</p>
          </div>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LIMITS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : movimientos.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-sm">Sin movimientos en el periodo seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-3 py-3 font-medium text-gray-700">Fecha</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-700">Producto</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-700">Tipo</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-700">Origen</th>
                  <th className="text-right px-3 py-3 font-medium text-gray-700">Cantidad</th>
                  <th className="text-right px-3 py-3 font-medium text-gray-700">Stock</th>
                  <th className="text-left px-3 py-3 font-medium text-gray-700">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((mov) => (
                  <tr key={mov.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                      {formatDateTime(mov.fecha)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs text-gray-500">{mov.producto_codigo}</span>
                      <span className="ml-1.5 text-gray-900">{mov.producto_nombre}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {mov.tipo === 'E' ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                          ENTRADA
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                          SALIDA
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 text-xs">{origenLabel(mov.origen)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {parseFloat(mov.cantidad).toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500 whitespace-nowrap tabular-nums text-xs">
                      {parseFloat(mov.stock_anterior).toFixed(3)}
                      <span className="mx-1 text-gray-300">&rarr;</span>
                      {parseFloat(mov.stock_nuevo).toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-[180px] truncate text-xs">
                      {mov.motivo ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mt-4">
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
