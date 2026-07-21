import { useRef, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { useFacturasPorMetodo, type CuadreFilters, type CobranzaCxCItem } from '../hooks/use-cuadre'

interface CuadreMetodoModalProps {
  isOpen: boolean
  onClose: () => void
  filters: CuadreFilters
  metodoNombre: string
  /** Registros individuales de cobros CxC para este método */
  cobrosPosList?: CobranzaCxCItem[]
}

export function CuadreMetodoModal({ isOpen, onClose, filters, metodoNombre }: CuadreMetodoModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { facturas, isLoading } = useFacturasPorMetodo(filters, isOpen ? metodoNombre : null)

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

  const totalUsd = facturas.reduce((sum, f) => sum + parseFloat(f.monto_usd), 0)

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
            <h2 className="text-lg font-semibold">Cobros: {metodoNombre}</h2>
            <p className="text-sm text-muted-foreground">{filters.fecha}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Sección 1: Ventas Contado */}
              {(() => {
                const contado = facturas.filter(f => f.es_pago_inicial === 1)
                const totalContadoUsd = contado.reduce((s, f) => s + parseFloat(f.monto_usd), 0)
                return contado.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Ventas contado ({contado.length})
                    </p>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-3 py-2 font-medium text-xs">Factura</th>
                            <th className="text-left px-3 py-2 font-medium text-xs">Cliente</th>
                            <th className="text-right px-3 py-2 font-medium text-xs">Monto</th>
                            <th className="text-right px-3 py-2 font-medium text-xs">USD</th>
                            <th className="text-left px-3 py-2 font-medium text-xs">Ref.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contado.map((f, i) => (
                            <tr key={`${f.venta_id}-${i}`} className="border-b last:border-0">
                              <td className="px-3 py-2">
                                <span className="font-mono text-xs">#{f.nro_factura}</span>
                              </td>
                              <td className="px-3 py-2 text-xs truncate max-w-[140px]">{f.cliente_nombre}</td>
                              <td className="px-3 py-2 text-right text-xs">
                                {f.moneda === 'BS' ? formatBs(parseFloat(f.monto)) : formatUsd(parseFloat(f.monto))}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className="font-bold text-xs">{formatUsd(parseFloat(f.monto_usd))}</span>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{f.referencia ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground mt-1 px-1">
                      <span>Subtotal contado</span>
                      <span>{formatUsd(totalContadoUsd)}</span>
                    </div>
                  </div>
                ) : null
              })()}

              {/* Sección 2: Cobranzas CxC */}
              {(() => {
                const cxc = facturas.filter(f => f.es_pago_inicial === 0)
                const totalCxCUsd = cxc.reduce((s, f) => s + parseFloat(f.monto_usd), 0)
                return cxc.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                      Cobranzas CxC ({cxc.length})
                    </p>
                    <div className="border border-blue-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-blue-50/60">
                            <th className="text-left px-3 py-2 font-medium text-xs">Factura</th>
                            <th className="text-left px-3 py-2 font-medium text-xs">Cliente</th>
                            <th className="text-right px-3 py-2 font-medium text-xs">Monto</th>
                            <th className="text-right px-3 py-2 font-medium text-xs">USD</th>
                            <th className="text-left px-3 py-2 font-medium text-xs">Ref.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cxc.map((f, i) => (
                            <tr key={`${f.venta_id}-${i}`} className="border-b last:border-0 bg-blue-50/20">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] bg-blue-100 text-blue-700 font-medium">CxC</span>
                                  <span className="font-mono text-xs">#{f.nro_factura}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-xs truncate max-w-[140px]">{f.cliente_nombre}</td>
                              <td className="px-3 py-2 text-right text-xs">
                                {f.moneda === 'BS' ? formatBs(parseFloat(f.monto)) : formatUsd(parseFloat(f.monto))}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span className="font-bold text-xs text-blue-700">{formatUsd(parseFloat(f.monto_usd))}</span>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{f.referencia ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(() => {
                      const totalCxCBs = cxc.reduce((s, f) => s + (f.moneda === 'BS' ? parseFloat(f.monto) : 0), 0)
                      return (
                        <div className="flex justify-between text-xs font-semibold text-blue-600 mt-1 px-1">
                          <span>Subtotal cobranzas</span>
                          <div className="flex items-center gap-2">
                            {totalCxCBs > 0.001 && <span className="text-muted-foreground font-normal">{formatBs(totalCxCBs)}</span>}
                            <span>{formatUsd(totalCxCUsd)}</span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                ) : null
              })()}

              {/* Total general */}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-sm font-semibold">Total</span>
                <div className="flex items-center gap-2">
                  {(() => {
                    const totalBs = facturas.reduce((s, f) => s + (f.moneda === 'BS' ? parseFloat(f.monto) : 0), 0)
                    return totalBs > 0.001 ? (
                      <span className="text-sm text-muted-foreground font-normal">{formatBs(totalBs)}</span>
                    ) : null
                  })()}
                  <span className="text-sm font-bold">{formatUsd(totalUsd)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  )
}
