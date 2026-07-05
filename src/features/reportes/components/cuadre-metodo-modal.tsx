import { useRef, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { formatUsd, formatBs } from '@/lib/currency'
import { useFacturasPorMetodo, type CuadreFilters, type CobroViaPOS } from '../hooks/use-cuadre'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface CuadreMetodoModalProps {
  isOpen: boolean
  onClose: () => void
  filters: CuadreFilters
  metodoNombre: string
  /** Cobros CxC via POS para todos los metodos — se filtra internamente por metodoNombre */
  cobrosPos?: CobroViaPOS[]
}

export function CuadreMetodoModal({ isOpen, onClose, filters, metodoNombre, cobrosPos }: CuadreMetodoModalProps) {
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

  // Cobros CxC via POS para este metodo especifico
  const cobrosEsteMétodo = (cobrosPos ?? []).filter((c) => c.nombre === metodoNombre)

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

        <Tabs defaultValue="ventas" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="shrink-0 mb-3">
            <TabsTrigger value="ventas">Ventas del dia</TabsTrigger>
            <TabsTrigger value="cobros">Cobros desde POS</TabsTrigger>
          </TabsList>

          {/* Tab 1: Ventas del dia — existing invoice table */}
          <TabsContent value="ventas" className="flex-1 min-h-0 flex flex-col mt-0">
            {isLoading ? (
              <div className="space-y-2 flex-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : facturas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex-1">
                <p className="text-sm">Sin pagos con este metodo</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <p className="text-xs text-muted-foreground mb-2 shrink-0">
                  {facturas.length} pago(s) del dia
                </p>
                <div className="overflow-y-auto border rounded-lg flex-1">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-3 py-2 font-medium">Factura</th>
                        <th className="text-left px-3 py-2 font-medium">Cliente</th>
                        <th className="text-right px-3 py-2 font-medium">Monto</th>
                        <th className="text-right px-3 py-2 font-medium">USD</th>
                        <th className="text-left px-3 py-2 font-medium">Ref.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facturas.map((f, i) => (
                        <tr key={`${f.venta_id}-${i}`} className="border-b border-muted">
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs">#{f.nro_factura}</span>
                          </td>
                          <td className="px-3 py-2 text-xs truncate max-w-[150px]">
                            {f.cliente_nombre}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            {f.moneda === 'BS' ? formatBs(parseFloat(f.monto)) : formatUsd(parseFloat(f.monto))}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="font-bold text-xs">{formatUsd(parseFloat(f.monto_usd))}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[100px]">
                            {f.referencia ?? '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Total */}
                <div className="pt-3 mt-3 border-t flex justify-between text-sm font-semibold shrink-0">
                  <span>Total</span>
                  <span>{formatUsd(totalUsd)}</span>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Cobros CxC desde POS (pagos de CxC aplicados via POS en sesiones anteriores) */}
          <TabsContent value="cobros" className="flex-1 min-h-0 flex flex-col mt-0">
            {cobrosEsteMétodo.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex-1">
                <p className="text-sm">Sin cobros CxC via POS con este metodo</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                {cobrosEsteMétodo.map((c) => (
                  <div
                    key={c.metodo_cobro_id}
                    className="rounded-lg border bg-blue-50/40 border-blue-200 px-4 py-3 space-y-1"
                  >
                    <p className="text-sm font-semibold text-blue-700">{c.nombre}</p>
                    {c.moneda === 'BS' && c.cobrosNativo > 0 && (
                      <div className="flex justify-between text-xs text-blue-600">
                        <span>Monto en Bs.</span>
                        <span className="font-semibold tabular-nums">{formatBs(c.cobrosNativo)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold text-blue-700 border-t border-blue-200 pt-1 mt-1">
                      <span>Total (USD)</span>
                      <span className="tabular-nums">{formatUsd(c.cobrosUsd)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </dialog>
  )
}
