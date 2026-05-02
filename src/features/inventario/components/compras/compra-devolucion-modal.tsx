import { useState } from 'react'
import { Warning, X, ArrowCounterClockwise } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { reversarCompra } from '@/features/inventario/hooks/use-compras'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { formatUsd } from '@/lib/currency'
import type { CompraConProveedor } from '@/features/inventario/hooks/use-compras'

interface CompraDevolucionModalProps {
  compra: CompraConProveedor
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CompraDevolucionModal({
  compra,
  isOpen,
  onClose,
  onSuccess,
}: CompraDevolucionModalProps) {
  const { user } = useCurrentUser()
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const totalUsd = parseFloat(compra.total_usd)
  const saldoPend = parseFloat(compra.saldo_pend_usd)
  const esCredito = compra.tipo === 'CREDITO'

  async function handleConfirmar() {
    if (!user?.empresa_id) return
    setLoading(true)
    try {
      await reversarCompra({
        compraId: compra.id,
        usuarioId: user.id,
        empresaId: user.empresa_id,
      })
      toast.success(`Factura ${compra.nro_factura} reversada exitosamente`)
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al reversar la factura'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-background shadow-xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 text-destructive">
            <ArrowCounterClockwise className="h-5 w-5" />
            <h3 className="text-base font-semibold">Reversar Factura de Compra</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Advertencia */}
          <div className="flex gap-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
            <Warning className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Esta accion es <strong>irreversible</strong>. Se crearan movimientos de reverso en el inventario y cuentas por pagar.
            </p>
          </div>

          {/* Detalle de la factura */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Factura:</span>
              <span className="font-mono font-semibold">{compra.nro_factura}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Proveedor:</span>
              <span>{compra.proveedor_nombre}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-semibold">{formatUsd(totalUsd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo:</span>
              <span>{compra.tipo}</span>
            </div>
          </div>

          {/* Que se reversara */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Se reversaran los siguientes registros:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Ingresos de inventario (Kardex) de cada producto</li>
              <li>Costo promedio ponderado de cada producto</li>
              {esCredito && saldoPend > 0.01 && (
                <li>Deuda en cuentas por pagar ({formatUsd(saldoPend)})</li>
              )}
              <li>Status de la factura cambiara a <strong>REVERSADA</strong></li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-destructive rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowCounterClockwise className="h-4 w-4" />
            {loading ? 'Reversando...' : 'Confirmar Reverso'}
          </button>
        </div>
      </div>
    </div>
  )
}
