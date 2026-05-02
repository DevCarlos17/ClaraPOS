import { useState, useRef, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import { useVentasAudit, useDetalleVenta, type CuadreFilters } from '../hooks/use-cuadre'

function formatHora(fechaStr: string): string {
  try {
    const parts = fechaStr.split(' ')
    if (parts.length >= 2) {
      return parts[1].substring(0, 5)
    }
    return ''
  } catch {
    return ''
  }
}

interface AuditModalProps {
  isOpen: boolean
  onClose: () => void
  filters: CuadreFilters
}

export function AuditModal({ isOpen, onClose, filters }: AuditModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { ventas, isLoading } = useVentasAudit(filters)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { detalles, pagos, isLoading: loadingDetalle } = useDetalleVenta(selectedId)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setSelectedId(null)
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const selectedVenta = ventas.find((v) => v.id === selectedId)

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-4xl shadow-xl max-h-[85vh]"
    >
      <div className="p-6 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Auditoria de Ventas</h2>
            <p className="text-sm text-muted-foreground">
              {filters.fecha} &middot; {ventas.length} factura(s)
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2 flex-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : ventas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground flex-1">
            <p className="text-sm">Sin ventas en esta fecha</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
            {/* Left: Invoice list */}
            <div className="overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-2 py-2 font-medium">Hora</th>
                    <th className="text-left px-2 py-2 font-medium">Factura</th>
                    <th className="text-left px-2 py-2 font-medium">Cliente</th>
                    <th className="text-right px-2 py-2 font-medium">Bs</th>
                    <th className="text-right px-2 py-2 font-medium">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => setSelectedId(v.id)}
                      className={`border-b border-muted cursor-pointer transition-colors ${
                        selectedId === v.id
                          ? 'bg-primary/5'
                          : 'hover:bg-muted/30'
                      }`}
                    >
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {formatHora(v.fecha)}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">#{v.nro_factura}</span>
                          {v.tipo === 'CREDITO' ? (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
                              CR
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
                              CT
                            </span>
                          )}
                          {v.status === 'ANULADA' && (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-500/20 ring-inset">
                              ANULADA
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs truncate max-w-[100px]">
                        {v.cliente_nombre}
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                        {formatBs(v.total_bs)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className="font-bold text-xs">{formatUsd(v.total_usd)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Right: Detail panel */}
            <div className="overflow-y-auto border rounded-lg p-4">
              {!selectedId ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm">Selecciona una factura para ver el detalle</p>
                </div>
              ) : loadingDetalle ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-8 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Venta info */}
                  {selectedVenta && (
                    <div className="text-xs space-y-1">
                      <p>
                        <span className="text-muted-foreground">Factura:</span>{' '}
                        <span className="font-mono font-bold">#{selectedVenta.nro_factura}</span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Cliente:</span>{' '}
                        {selectedVenta.cliente_nombre} ({selectedVenta.cliente_identificacion})
                      </p>
                      <p>
                        <span className="text-muted-foreground">Fecha:</span>{' '}
                        {formatDateTime(selectedVenta.fecha)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Total:</span>{' '}
                        <span className="font-bold">{formatUsd(selectedVenta.total_usd)}</span>{' '}
                        / {formatBs(selectedVenta.total_bs)}
                      </p>
                    </div>
                  )}

                  {/* Articulos */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Articulos</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 font-medium">Producto</th>
                          <th className="text-right py-1 font-medium">Cant</th>
                          <th className="text-right py-1 font-medium">Precio</th>
                          <th className="text-right py-1 font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalles.map((d, i) => {
                          const cant = parseFloat(d.cantidad)
                          const precio = parseFloat(d.precio_unitario_usd)
                          return (
                            <tr key={i} className="border-b border-muted">
                              <td className="py-1 truncate max-w-[120px]">{d.producto_nombre}</td>
                              <td className="py-1 text-right">{cant}</td>
                              <td className="py-1 text-right">{formatUsd(precio)}</td>
                              <td className="py-1 text-right font-medium">
                                {formatUsd(cant * precio)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagos */}
                  {pagos.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Pagos</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1 font-medium">Metodo</th>
                            <th className="text-right py-1 font-medium">Monto</th>
                            <th className="text-right py-1 font-medium">USD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagos.map((p, i) => (
                            <tr key={i} className="border-b border-muted">
                              <td className="py-1">
                                {p.metodo_nombre}
                                {p.referencia && (
                                  <span className="text-muted-foreground ml-1">
                                    ({p.referencia})
                                  </span>
                                )}
                              </td>
                              <td className="py-1 text-right">
                                {p.moneda === 'BS'
                                  ? formatBs(p.monto)
                                  : formatUsd(p.monto)}
                              </td>
                              <td className="py-1 text-right font-medium">
                                {formatUsd(p.monto_usd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}
