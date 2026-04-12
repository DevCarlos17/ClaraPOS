import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import { registrarPagoFactura, type VentaPendiente } from '../hooks/use-cxc'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface PagoFacturaModalProps {
  isOpen: boolean
  onClose: () => void
  factura: VentaPendiente | null
  clienteId: string
  onSuccess: () => void
}

function formatFecha(fecha: string): string {
  try {
    const d = new Date(fecha)
    return d.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return fecha
  }
}

export function PagoFacturaModal({
  isOpen,
  onClose,
  factura,
  clienteId,
  onSuccess,
}: PagoFacturaModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()

  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [referencia, setReferencia] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal()
      setMetodoPagoId('')
      setMontoStr('')
      setReferencia('')
    } else {
      dialogRef.current?.close()
    }
  }, [isOpen])

  if (!factura) return null

  const saldoPend = parseFloat(factura.saldo_pend_usd)
  const metodoSeleccionado = metodos.find((m) => m.id === metodoPagoId)
  const moneda = metodoSeleccionado?.moneda ?? 'USD'
  const monto = parseFloat(montoStr) || 0

  const montoUsd = moneda === 'BS' ? bsToUsd(monto, tasaValor) : monto
  const montoBs = moneda === 'USD' ? usdToBs(monto, tasaValor) : monto

  const excedeSaldo = montoUsd > saldoPend + 0.01
  const canSubmit = metodoPagoId && monto > 0 && !excedeSaldo && !submitting

  const handlePayMax = () => {
    if (moneda === 'BS') {
      setMontoStr(usdToBs(saldoPend, tasaValor).toFixed(2))
    } else {
      setMontoStr(saldoPend.toFixed(2))
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    setSubmitting(true)
    try {
      await registrarPagoFactura({
        venta_id: factura.id,
        cliente_id: clienteId,
        metodo_cobro_id: metodoPagoId,
        moneda: moneda as 'USD' | 'BS',
        tasa: tasaValor,
        monto,
        referencia: referencia.trim() || undefined,
        empresa_id: user!.empresa_id!,
      })
      toast.success(`Pago de ${formatUsd(montoUsd)} registrado a factura ${factura.nro_factura}`)
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al registrar pago')
    } finally {
      setSubmitting(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-md shadow-xl"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Pagar Factura</h2>
            <p className="text-sm text-muted-foreground">
              #{factura.nro_factura} - {formatFecha(factura.fecha)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Resumen factura */}
        <div className="rounded-lg border bg-muted/50 p-3 mb-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total factura</span>
            <span className="font-medium">{formatUsd(factura.total_usd)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Saldo pendiente</span>
            <span className="font-bold text-red-600">{formatUsd(saldoPend)}</span>
          </div>
          {tasaValor > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Equivalente Bs</span>
              <span className="text-muted-foreground">
                {formatBs(usdToBs(saldoPend, tasaValor))}
              </span>
            </div>
          )}
        </div>

        {/* Form */}
        <div className="space-y-3">
          {/* Metodo de pago */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Metodo de pago</label>
            <select
              value={metodoPagoId}
              onChange={(e) => {
                setMetodoPagoId(e.target.value)
                setMontoStr('')
              }}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Seleccionar...</option>
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.moneda})
                </option>
              ))}
            </select>
          </div>

          {/* Monto */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Monto ({moneda})
              </label>
              <button
                type="button"
                onClick={handlePayMax}
                className="text-xs text-primary hover:underline"
              >
                Pagar total
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={montoStr}
              onChange={(e) => setMontoStr(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {monto > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {moneda === 'USD'
                  ? `Equivale a ${formatBs(montoBs)}`
                  : `Equivale a ${formatUsd(montoUsd)}`}
              </p>
            )}
            {excedeSaldo && (
              <p className="text-xs text-destructive mt-1">
                El monto excede el saldo pendiente de la factura
              </p>
            )}
          </div>

          {/* Referencia */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Referencia (opcional)
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nro. transferencia, etc."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Registrando...' : `Pagar ${formatUsd(montoUsd)}`}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
