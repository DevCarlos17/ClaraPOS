import { useState } from 'react'
import { Clock, ShoppingBag, Trash2, RotateCcw } from 'lucide-react'
import { formatDateTime } from '@/lib/format'
import { formatUsd, formatBs } from '@/lib/currency'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useFacturasEsperaStore, type FacturaEnEspera } from '../stores/facturas-espera-store'

interface FacturasEsperaModalProps {
  isOpen: boolean
  onClose: () => void
  onRecuperar: (factura: FacturaEnEspera) => void
}

export function FacturasEsperaModal({ isOpen, onClose, onRecuperar }: FacturasEsperaModalProps) {
  const { facturas, eliminar } = useFacturasEsperaStore()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (!isOpen) return null

  const handleRecuperar = (factura: FacturaEnEspera) => {
    onRecuperar(factura)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-2xl mx-4 border flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b">
          <Clock size={18} className="text-primary" />
          <div className="flex-1">
            <h3 className="text-base font-semibold">Facturas en Espera</h3>
            <p className="text-xs text-muted-foreground">
              {facturas.length === 0
                ? 'No hay facturas en espera'
                : `${facturas.length} factura${facturas.length !== 1 ? 's' : ''} en espera`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm border hover:bg-muted transition-colors"
          >
            Cerrar
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {facturas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingBag size={40} className="text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No hay facturas en espera</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Usa "En Espera" para guardar una venta temporalmente
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
                  <th className="text-center px-4 py-2.5 font-medium">Items</th>
                  <th className="text-right px-4 py-2.5 font-medium">Total USD</th>
                  <th className="text-right px-4 py-2.5 font-medium">Total Bs</th>
                  <th className="text-left px-4 py-2.5 font-medium">Usuario</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(f.fecha)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {f.clienteNombre || <span className="text-muted-foreground italic">Sin cliente</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                        {f.itemsCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatUsd(f.totalUsd)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatBs(f.totalBs)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{f.usuarioNombre}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => handleRecuperar(f)}
                          title="Recuperar factura"
                          className="rounded-md p-1.5 text-primary hover:bg-primary/10 transition-colors"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(f.id)}
                          title="Eliminar factura"
                          className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) eliminar(confirmId)
          setConfirmId(null)
        }}
        titulo="Eliminar factura en espera"
        mensaje="¿Seguro que deseas eliminar esta factura? Se perderán todos los items registrados."
        confirmarTexto="Eliminar"
        destructive
      />
    </div>
  )
}
