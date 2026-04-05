import { useEffect, useRef } from 'react'
import { useDetalleCompra } from '@/features/inventario/hooks/use-compras'
import { formatUsd } from '@/lib/currency'

interface CompraDetalleModalProps {
  compraId: string
  isOpen: boolean
  onClose: () => void
}

export function CompraDetalleModal({ compraId, isOpen, onClose }: CompraDetalleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { detalle, isLoading } = useDetalleCompra(compraId)

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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Detalle de Compra</h2>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : detalle.length === 0 ? (
          <p className="text-gray-500 text-sm">Sin lineas de detalle</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Codigo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Costo USD</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {detalle.map((d) => {
                  const cantidad = parseFloat(d.cantidad)
                  const costo = parseFloat(d.costo_unitario_usd)
                  const subtotal = cantidad * costo
                  return (
                    <tr key={d.id}>
                      <td className="px-3 py-2 text-sm font-mono text-gray-500">{d.producto_codigo}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{d.producto_nombre}</td>
                      <td className="px-3 py-2 text-sm text-right text-gray-900">{cantidad.toFixed(3)}</td>
                      <td className="px-3 py-2 text-sm text-right text-gray-900">{formatUsd(costo)}</td>
                      <td className="px-3 py-2 text-sm text-right font-medium text-gray-900">{formatUsd(subtotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-sm font-medium text-gray-700 text-right">Total:</td>
                  <td className="px-3 py-2 text-sm font-bold text-gray-900 text-right">
                    {formatUsd(
                      detalle.reduce((sum, d) => sum + parseFloat(d.cantidad) * parseFloat(d.costo_unitario_usd), 0)
                    )}
                  </td>
                </tr>
              </tfoot>
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
