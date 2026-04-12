import { useEffect, useRef } from 'react'
import { useAjusteDetalle } from '@/features/inventario/hooks/use-ajustes'

interface AjusteDetalleModalProps {
  isOpen: boolean
  onClose: () => void
  ajusteId: string
}

export function AjusteDetalleModal({ isOpen, onClose, ajusteId }: AjusteDetalleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { lineas, isLoading } = useAjusteDetalle(ajusteId)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

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
        <h2 className="text-lg font-semibold mb-4">Detalle del Ajuste</h2>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-10 bg-gray-100 rounded animate-pulse" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
            ))}
          </div>
        ) : lineas.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">Sin lineas de detalle</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Producto</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Deposito</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Cantidad</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Costo Unit.</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea) => (
                  <tr key={linea.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900">
                      <span className="font-mono text-gray-500 text-xs">{linea.codigo_producto}</span>
                      <span className="mx-1.5 text-gray-300">|</span>
                      {linea.nombre_producto ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{linea.nombre_deposito ?? '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                      {parseFloat(linea.cantidad).toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {linea.costo_unitario != null
                        ? `$${parseFloat(linea.costo_unitario).toFixed(2)}`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            type="button"
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
