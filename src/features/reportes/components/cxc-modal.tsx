import { useRef, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { formatUsd } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { useDetalleCxcDia, type CuadreFilters } from '../hooks/use-cuadre'

interface CxcModalProps {
  isOpen: boolean
  onClose: () => void
  filters: CuadreFilters
}

export function CxcModal({ isOpen, onClose, filters }: CxcModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { facturas, isLoading } = useDetalleCxcDia(filters)

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

  const totalPendiente = facturas.reduce(
    (sum, f) => sum + parseFloat(f.saldo_pend_usd),
    0
  )

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-2xl shadow-xl max-h-[85vh]"
    >
      <div className="p-6 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Cuentas por Cobrar del Dia</h2>
            <p className="text-sm text-muted-foreground">
              {filters.fecha} &middot; {facturas.length} factura(s) con saldo pendiente
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2 flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : facturas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground flex-1">
            <p className="text-sm">Sin cuentas por cobrar en esta fecha</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="overflow-y-auto border rounded-lg flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">Factura</th>
                    <th className="text-left px-3 py-2 font-medium">Cliente</th>
                    <th className="text-left px-3 py-2 font-medium">Fecha</th>
                    <th className="text-right px-3 py-2 font-medium">Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((f) => (
                    <tr key={f.id} className="border-b border-muted">
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">#{f.nro_factura}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div>
                          <p className="text-xs font-medium truncate max-w-[180px]">
                            {f.cliente_nombre}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {f.cliente_identificacion}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDateTime(f.fecha)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-bold text-xs text-red-600">
                          {formatUsd(parseFloat(f.saldo_pend_usd))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total */}
            <div className="pt-3 mt-3 border-t flex justify-between text-sm font-semibold shrink-0">
              <span>Total pendiente</span>
              <span className="text-red-600">{formatUsd(totalPendiente)}</span>
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}
