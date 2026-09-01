import { useRef, useEffect } from 'react'
import { X } from '@phosphor-icons/react'
import { formatBs, formatUsd } from '@/lib/currency'
import type { DiferencialCambioItem } from '../hooks/use-cuadre'

interface DiferencialCambiarioModalProps {
  open: boolean
  onClose: () => void
  items: DiferencialCambioItem[]
  totalFaltanteBs: number
  totalFaltanteUsd: number
  totalSobranteBs: number
  fecha: string
}

export function DiferencialCambiarioModal({
  open,
  onClose,
  items,
  totalFaltanteBs,
  totalFaltanteUsd,
  totalSobranteBs,
  fecha,
}: DiferencialCambiarioModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal()
    } else {
      dialogRef.current?.close()
    }
  }, [open])

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  const faltantes = items.filter((i) => i.tipo === 'FALTANTE')
  const sobrantes = items.filter((i) => i.tipo === 'SOBRANTE')

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
            <h2 className="text-lg font-semibold">Diferencial Cambiario</h2>
            <p className="text-sm text-muted-foreground">{fecha}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay diferenciales cambiarios registrados en esta sesion
            </p>
          ) : (
            <>
              {/* Faltantes */}
              {faltantes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Faltantes autorizados ({faltantes.length})
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left px-3 py-2 font-medium text-xs">Factura</th>
                          <th className="text-right px-3 py-2 font-medium text-xs">Monto (Bs.)</th>
                          <th className="text-right px-3 py-2 font-medium text-xs">Monto (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faltantes.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              <span className="font-mono text-xs">{item.nroFactura || '—'}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-bold text-xs text-amber-700">{formatBs(item.montoBs)}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="text-xs text-muted-foreground">{formatUsd(item.montoUsd)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-muted-foreground mt-1 px-1">
                    <span>Subtotal faltantes</span>
                    <div className="flex items-center gap-2">
                      <span className="font-normal text-muted-foreground">{formatUsd(totalFaltanteUsd)}</span>
                      <span className="text-amber-700">{formatBs(totalFaltanteBs)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Sobrantes */}
              {sobrantes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Sobrantes ({sobrantes.length})
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left px-3 py-2 font-medium text-xs">Referencia</th>
                          <th className="text-right px-3 py-2 font-medium text-xs">Monto (Bs.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sobrantes.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              <span className="font-mono text-xs">{item.nroFactura || '—'}</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-bold text-xs text-green-700">{formatBs(item.montoBs)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-muted-foreground mt-1 px-1">
                    <span>Subtotal sobrantes</span>
                    <span className="text-green-700">{formatBs(totalSobranteBs)}</span>
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-sm font-semibold">Total diferencial</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground font-normal">{formatUsd(totalFaltanteUsd)}</span>
                  <span className="text-sm font-bold text-amber-700">{formatBs(totalFaltanteBs - totalSobranteBs)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  )
}
