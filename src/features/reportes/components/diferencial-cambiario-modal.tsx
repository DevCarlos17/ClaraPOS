import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatBs, formatUsd } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
import type { DiferencialCambioItem } from '../hooks/use-cuadre'

interface DiferencialCambiarioModalProps {
  open: boolean
  onClose: () => void
  items: DiferencialCambioItem[]
  totalFaltanteBs: number
  totalFaltanteUsd: number
  totalSobranteBs: number
}

export function DiferencialCambiarioModal({
  open,
  onClose,
  items,
  totalFaltanteBs,
  totalFaltanteUsd,
  totalSobranteBs,
}: DiferencialCambiarioModalProps) {
  const faltantes = items.filter((i) => i.tipo === 'FALTANTE')
  const sobrantes = items.filter((i) => i.tipo === 'SOBRANTE')

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diferenciales Cambiarios</DialogTitle>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No hay diferenciales cambiarios registrados en esta sesion
          </div>
        ) : (
          <div className="space-y-5">
            {/* Resumen */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">
                  Faltantes autorizados
                </p>
                <p className="text-lg font-bold text-red-700 dark:text-red-300 tabular-nums">
                  {formatBs(totalFaltanteBs)}
                </p>
                <p className="text-xs text-red-500 tabular-nums">
                  {formatUsd(totalFaltanteUsd)}
                </p>
              </div>
              {totalSobranteBs > 0.001 && (
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">
                    Sobrantes registrados
                  </p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-300 tabular-nums">
                    {formatBs(totalSobranteBs)}
                  </p>
                </div>
              )}
            </div>

            {/* Tabla de faltantes */}
            {faltantes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Faltantes ({faltantes.length})
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium">Factura</th>
                        <th className="px-3 py-2 text-right font-medium">Monto (Bs.)</th>
                        <th className="px-3 py-2 text-right font-medium">Monto (USD)</th>
                        <th className="px-3 py-2 text-left font-medium">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {faltantes.map((item) => (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs">{item.nroFactura || '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-600 dark:text-red-400">
                            {formatBs(item.montoBs)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-xs">
                            {formatUsd(item.montoUsd)}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {formatDateTime(item.fecha)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td className="px-3 py-2 text-sm font-semibold">Total</td>
                        <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-red-600 dark:text-red-400">
                          {formatBs(totalFaltanteBs)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                          {formatUsd(totalFaltanteUsd)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Tabla de sobrantes */}
            {sobrantes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Sobrantes ({sobrantes.length})
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium">Referencia</th>
                        <th className="px-3 py-2 text-right font-medium">Monto (Bs.)</th>
                        <th className="px-3 py-2 text-left font-medium">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sobrantes.map((item) => (
                        <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs">{item.nroFactura || '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-green-600 dark:text-green-400">
                            {formatBs(item.montoBs)}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {formatDateTime(item.fecha)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
