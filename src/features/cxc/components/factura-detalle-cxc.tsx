import { useRef, useEffect } from 'react'
import { X, Package, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { useDetalleFactura, usePagosFactura, type VentaPendiente } from '../hooks/use-cxc'

interface FacturaDetalleCxcProps {
  isOpen: boolean
  onClose: () => void
  factura: VentaPendiente | null
}

function formatFecha(fecha: string): string {
  try {
    return new Date(fecha).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return fecha
  }
}

function formatFechaHora(fecha: string): string {
  try {
    return new Date(fecha).toLocaleString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return fecha
  }
}

export function FacturaDetalleCxc({ isOpen, onClose, factura }: FacturaDetalleCxcProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { tasaValor } = useTasaActual()
  const { detalle, isLoading: loadingDetalle } = useDetalleFactura(factura?.id ?? null)
  const { pagos, isLoading: loadingPagos } = usePagosFactura(factura?.id ?? null)

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

  if (!factura) return null

  const totalUsd = parseFloat(factura.total_usd)
  const totalBs = parseFloat(factura.total_bs)
  const saldoPend = parseFloat(factura.saldo_pend_usd)
  const totalAbonado = totalUsd - saldoPend

  const totalPagado = pagos.reduce((sum, p) => sum + parseFloat(p.monto_usd), 0)

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/60 rounded-lg p-0 w-full max-w-2xl shadow-xl"
    >
      <div className="p-6 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Factura #{factura.nro_factura}</h2>
            <p className="text-sm text-muted-foreground">{formatFecha(factura.fecha)}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Resumen de montos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Total</p>
            <p className="font-bold">{formatUsd(totalUsd)}</p>
            {tasaValor > 0 && <p className="text-xs text-muted-foreground">{formatBs(totalBs)}</p>}
          </div>
          <div className="rounded-lg border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground mb-0.5">Tasa usada</p>
            <p className="font-bold text-sm">{parseFloat(factura.tasa).toFixed(4)}</p>
          </div>
          <div className="rounded-lg border bg-green-50 p-3 text-center">
            <p className="text-xs text-green-700/70 mb-0.5">Abonado</p>
            <p className="font-bold text-green-700">{formatUsd(totalAbonado)}</p>
          </div>
          <div className="rounded-lg border bg-red-50 p-3 text-center">
            <p className="text-xs text-red-700/70 mb-0.5">Pendiente</p>
            <p className="font-bold text-red-600">{formatUsd(saldoPend)}</p>
            {tasaValor > 0 && (
              <p className="text-xs text-red-700/50">{formatBs(usdToBs(saldoPend, tasaValor))}</p>
            )}
          </div>
        </div>

        {/* Articulos */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Package size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold">Articulos</h3>
          </div>
          {loadingDetalle ? (
            <div className="h-20 bg-muted rounded animate-pulse" />
          ) : detalle.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sin detalle disponible</p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-xs">Codigo</th>
                    <th className="text-left px-3 py-2 font-medium text-xs">Producto</th>
                    <th className="text-right px-3 py-2 font-medium text-xs">Cant</th>
                    <th className="text-right px-3 py-2 font-medium text-xs">P.Unit</th>
                    <th className="text-right px-3 py-2 font-medium text-xs">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((d) => {
                    const cant = parseFloat(d.cantidad)
                    const precio = parseFloat(d.precio_unitario_usd)
                    const subt = parseFloat(d.subtotal_usd)
                    return (
                      <tr key={d.id} className="border-b border-muted">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {d.producto_codigo}
                        </td>
                        <td className="px-3 py-2">{d.producto_nombre}</td>
                        <td className="px-3 py-2 text-right">
                          {cant % 1 === 0 ? cant.toFixed(0) : cant.toFixed(3)}
                        </td>
                        <td className="px-3 py-2 text-right">{formatUsd(precio)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatUsd(subt)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="px-3 py-2 text-right font-semibold text-xs uppercase">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{formatUsd(totalUsd)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Abonos recibidos */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={14} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold">Abonos recibidos</h3>
          </div>
          {loadingPagos ? (
            <div className="h-16 bg-muted rounded animate-pulse" />
          ) : pagos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
              Sin pagos registrados
            </p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-xs">Fecha</th>
                    <th className="text-left px-3 py-2 font-medium text-xs">Metodo</th>
                    <th className="text-left px-3 py-2 font-medium text-xs">Moneda</th>
                    <th className="text-right px-3 py-2 font-medium text-xs">Monto orig.</th>
                    <th className="text-right px-3 py-2 font-medium text-xs">Equiv. USD</th>
                    <th className="text-right px-3 py-2 font-medium text-xs">Tasa</th>
                    <th className="text-left px-3 py-2 font-medium text-xs">Ref.</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((p) => {
                    const montoOrig = parseFloat(p.monto)
                    const montoUsd = parseFloat(p.monto_usd)
                    const tasaPago = parseFloat(p.tasa)
                    return (
                      <tr key={p.id} className="border-b border-muted">
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {formatFechaHora(p.fecha)}
                        </td>
                        <td className="px-3 py-2">{p.metodo_nombre}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            p.moneda_label === 'BS' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
                          }`}>
                            {p.moneda_label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {p.moneda_label === 'BS' ? formatBs(montoOrig) : formatUsd(montoOrig)}
                        </td>
                        <td className="px-3 py-2 text-right text-green-700 font-medium">
                          {formatUsd(montoUsd)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                          {tasaPago.toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {p.referencia || '-'}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="px-3 py-2 text-right font-semibold text-xs uppercase">
                      Total pagado
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-green-700">
                      {formatUsd(totalPagado)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen saldo */}
          {pagos.length > 0 && (
            <div className="mt-3 flex justify-end gap-6 text-sm">
              <span className="text-muted-foreground">
                Pagado: <span className="font-medium text-green-700">{formatUsd(totalPagado)}</span>
              </span>
              <span className="text-muted-foreground">
                Pendiente:{' '}
                <span className={`font-bold ${saldoPend > 0.001 ? 'text-red-600' : 'text-green-700'}`}>
                  {formatUsd(saldoPend)}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-5">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </dialog>
  )
}
