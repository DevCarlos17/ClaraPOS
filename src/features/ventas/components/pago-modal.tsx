import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatUsd, formatBs, usdToBs } from '@/lib/currency'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import type { PagoEntryForm } from '../schemas/venta-schema'

interface PagoModalProps {
  open: boolean
  onClose: () => void
  totalUsd: number
  totalBs: number
  tasa: number
  tipoVenta: 'CONTADO' | 'CREDITO'
  nroFacturaPreview: string
  onConfirm: (pagos: PagoEntryForm[]) => void
  submitting: boolean
}

export function PagoModal({
  open,
  onClose,
  totalUsd,
  totalBs,
  tasa,
  tipoVenta,
  nroFacturaPreview,
  onConfirm,
  submitting,
}: PagoModalProps) {
  const { metodos } = useMetodosPagoActivos()
  const [pagos, setPagos] = useState<PagoEntryForm[]>([])

  // Form state for adding a payment
  const [metodoId, setMetodoId] = useState('')
  const [monto, setMonto] = useState('')
  const [referencia, setReferencia] = useState('')

  const selectedMetodo = metodos.find((m) => m.id === metodoId)
  const monedaMetodo = selectedMetodo?.moneda as 'USD' | 'BS' | undefined

  const totalAbonadoUsd = pagos.reduce((sum, p) => {
    const montoUsd = p.moneda === 'BS' ? Number((p.monto / tasa).toFixed(2)) : p.monto
    return sum + montoUsd
  }, 0)

  const pendienteUsd = Math.max(0, Number((totalUsd - totalAbonadoUsd).toFixed(2)))
  const pendienteBs = usdToBs(pendienteUsd, tasa)

  const canConfirm =
    tipoVenta === 'CREDITO' ? true : pendienteUsd <= 0.01

  const handleAddPago = () => {
    const montoNum = parseFloat(monto)
    if (!metodoId || isNaN(montoNum) || montoNum <= 0 || !monedaMetodo) return

    setPagos((prev) => [
      ...prev,
      {
        metodo_pago_id: metodoId,
        metodo_nombre: selectedMetodo!.nombre,
        moneda: monedaMetodo,
        monto: montoNum,
        referencia: referencia.trim() || undefined,
      },
    ])

    setMetodoId('')
    setMonto('')
    setReferencia('')
  }

  const handleRemovePago = (index: number) => {
    setPagos((prev) => prev.filter((_, i) => i !== index))
  }

  const handleConfirm = () => {
    onConfirm(pagos)
  }

  const handleClose = () => {
    setPagos([])
    setMetodoId('')
    setMonto('')
    setReferencia('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Procesar Pago</DialogTitle>
          <DialogDescription>
            Factura #{nroFacturaPreview} - {tipoVenta}
          </DialogDescription>
        </DialogHeader>

        {/* Resumen */}
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
          <div>
            <span className="text-muted-foreground">Total USD:</span>
            <span className="ml-2 font-bold">{formatUsd(totalUsd)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Bs:</span>
            <span className="ml-2 font-bold">{formatBs(totalBs)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Abonado:</span>
            <span className="ml-2 font-medium text-green-600">{formatUsd(totalAbonadoUsd)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Pendiente:</span>
            <span className={`ml-2 font-medium ${pendienteUsd > 0.01 ? 'text-orange-600' : 'text-green-600'}`}>
              {formatUsd(pendienteUsd)} / {formatBs(pendienteBs)}
            </span>
          </div>
        </div>

        {/* Lista de pagos agregados */}
        {pagos.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Pagos agregados:</p>
            {pagos.map((p, i) => {
              const equiv = p.moneda === 'BS' ? Number((p.monto / tasa).toFixed(2)) : p.monto
              return (
                <div key={i} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{p.metodo_nombre}</span>
                    {p.referencia && (
                      <span className="ml-2 text-xs text-muted-foreground">Ref: {p.referencia}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span>
                      {p.moneda === 'BS' ? formatBs(p.monto) : formatUsd(p.monto)}
                      {p.moneda === 'BS' && (
                        <span className="text-xs text-muted-foreground ml-1">({formatUsd(equiv)})</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePago(i)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Formulario agregar pago */}
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-xs font-medium text-muted-foreground">Agregar pago:</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Metodo de pago</label>
              <select
                value={metodoId}
                onChange={(e) => setMetodoId(e.target.value)}
                className="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Seleccionar...</option>
                {metodos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} ({m.moneda})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Monto {monedaMetodo ? `(${monedaMetodo})` : ''}
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Referencia (opcional)</label>
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Nro. transferencia, etc."
                className="w-full rounded border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddPago}
              disabled={!metodoId || !monto || parseFloat(monto) <= 0}
            >
              <Plus size={14} className="mr-1" />
              Agregar
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || submitting}>
            {submitting ? 'Procesando...' : 'Confirmar Venta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
