import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatUsd, formatBs } from '@/lib/currency'
import type { SafFacturaItem } from '../hooks/use-cuadre'

interface SafDetalleModalProps {
  open: boolean
  onClose: () => void
  items: SafFacturaItem[]
  tasaDelDia: number
}

export function SafDetalleModal({ open, onClose, items, tasaDelDia }: SafDetalleModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ventas pagadas con Saldo a Favor</DialogTitle>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No hay ventas pagadas con saldo a favor en esta sesion
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Factura</th>
                  <th className="px-3 py-2 text-left font-medium">Cliente</th>
                  <th className="px-3 py-2 text-right font-medium">SAF aplicado</th>
                  <th className="px-3 py-2 text-right font-medium">Total factura</th>
                  <th className="px-3 py-2 text-center font-medium">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const tasaItem = item.tasa > 0 ? item.tasa : tasaDelDia
                  const safBs = tasaItem > 0 ? item.montoSafUsd * tasaItem : 0
                  return (
                    <tr key={item.movimientoCuentaId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{item.nroFactura}</td>
                      <td className="px-3 py-2">{item.clienteNombre}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="font-semibold">{formatUsd(item.montoSafUsd)}</span>
                        {safBs > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {formatBs(safBs)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatUsd(item.totalFacturaUsd)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {item.esPagoTotal ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Total
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Parcial
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td colSpan={2} className="px-3 py-2 text-sm font-semibold">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold tabular-nums">
                    {formatUsd(items.reduce((s, i) => s + i.montoSafUsd, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
