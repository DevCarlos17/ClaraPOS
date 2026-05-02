import { useRef, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { formatUsd } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useProductosPorDepto, type CuadreFilters } from '../hooks/use-cuadre'

interface CuadreDeptoModalProps {
  isOpen: boolean
  onClose: () => void
  filters: CuadreFilters
  deptoNombre: string
}

export function CuadreDeptoModal({ isOpen, onClose, filters, deptoNombre }: CuadreDeptoModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { productos, isLoading } = useProductosPorDepto(filters, isOpen ? deptoNombre : null)

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

  const totalUsd = productos.reduce((sum, p) => sum + p.totalUsd, 0)
  const totalCant = productos.reduce((sum, p) => sum + p.cantidad, 0)

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
            <h2 className="text-lg font-semibold">Depto: {deptoNombre}</h2>
            <p className="text-sm text-muted-foreground">
              {filters.fecha} &middot; {productos.length} producto(s) vendido(s)
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
        ) : productos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground flex-1">
            <p className="text-sm">Sin productos vendidos en este departamento</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <div className="overflow-y-auto border rounded-lg flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium">Codigo</th>
                    <th className="text-left px-3 py-2 font-medium">Producto</th>
                    <th className="text-right px-3 py-2 font-medium">Cantidad</th>
                    <th className="text-right px-3 py-2 font-medium">Total USD</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p, i) => (
                    <tr key={p.codigo} className="border-b border-muted">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{p.codigo}</td>
                      <td className="px-3 py-2 text-xs font-medium truncate max-w-[200px]">{p.nombre}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(p.cantidad, 0)}</td>
                      <td className="px-3 py-2 text-right font-bold">{formatUsd(p.totalUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="pt-3 mt-3 border-t flex justify-between text-sm font-semibold shrink-0">
              <span>{formatNumber(totalCant, 0)} unidades</span>
              <span>{formatUsd(totalUsd)}</span>
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}
