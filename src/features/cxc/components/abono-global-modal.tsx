import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import { registrarAbonoGlobal, useFacturasPendientes } from '../hooks/use-cxc'
import { useCurrentUser } from '@/core/hooks/use-current-user'

interface AbonoGlobalModalProps {
  isOpen: boolean
  onClose: () => void
  clienteId: string
  clienteNombre: string
  saldoActual: number
  onSuccess: () => void
}

export function AbonoGlobalModal({
  isOpen,
  onClose,
  clienteId,
  clienteNombre,
  saldoActual,
  onSuccess,
}: AbonoGlobalModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { tasaValor } = useTasaActual()
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { facturas } = useFacturasPendientes(isOpen ? clienteId : null)

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

  const metodoSeleccionado = metodos.find((m) => m.id === metodoPagoId)
  const moneda = metodoSeleccionado?.moneda ?? 'USD'
  const monto = parseFloat(montoStr) || 0
  const montoUsd = moneda === 'BS' ? bsToUsd(monto, tasaValor) : monto
  const montoBs = moneda === 'USD' ? usdToBs(monto, tasaValor) : monto

  const canSubmit = metodoPagoId && monto > 0 && !submitting

  // Simulacion FIFO para preview
  const fifoPreview = (() => {
    if (montoUsd <= 0) return []
    let restante = montoUsd
    const result: { nro_factura: string; saldo: number; aplicar: number }[] = []
    for (const f of facturas) {
      if (restante <= 0.01) break
      const saldo = parseFloat(f.saldo_pend_usd)
      const aplicar = Math.min(saldo, restante)
      result.push({ nro_factura: f.nro_factura, saldo, aplicar })
      restante = Number((restante - aplicar).toFixed(2))
    }
    if (restante > 0.01) {
      result.push({ nro_factura: 'ANTICIPO', saldo: 0, aplicar: restante })
    }
    return result
  })()

  const handlePayMax = () => {
    if (moneda === 'BS') {
      setMontoStr(usdToBs(saldoActual, tasaValor).toFixed(2))
    } else {
      setMontoStr(saldoActual.toFixed(2))
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const result = await registrarAbonoGlobal({
        cliente_id: clienteId,
        metodo_cobro_id: metodoPagoId,
        moneda: moneda as 'USD' | 'BS',
        tasa: tasaValor,
        monto,
        referencia: referencia.trim() || undefined,
        empresa_id: user!.empresa_id!,
      })
      toast.success(
        `Abono de ${formatUsd(result.montoAplicado)} registrado. ${result.facturasAfectadas} factura(s) afectada(s).`
      )
      onSuccess()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al registrar abono')
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
      className="backdrop:bg-black/50 rounded-lg p-0 w-full max-w-lg shadow-xl"
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Abono Global</h2>
            <p className="text-sm text-muted-foreground">{clienteNombre}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Resumen saldo */}
        <div className="rounded-lg border bg-muted/50 p-3 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Deuda total</span>
            <span className="font-bold text-red-600">{formatUsd(saldoActual)}</span>
          </div>
          {tasaValor > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Equivalente Bs</span>
              <span className="text-muted-foreground">
                {formatBs(usdToBs(saldoActual, tasaValor))}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Facturas pendientes</span>
            <span className="font-medium">{facturas.length}</span>
          </div>
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
                Pagar deuda total
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

        {/* Preview FIFO */}
        {fifoPreview.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Distribucion del pago (FIFO)
            </p>
            <div className="overflow-x-auto border rounded-lg max-h-40 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-2 py-1.5 font-medium">Factura</th>
                    <th className="text-right px-2 py-1.5 font-medium">Saldo</th>
                    <th className="text-right px-2 py-1.5 font-medium">Aplicar</th>
                  </tr>
                </thead>
                <tbody>
                  {fifoPreview.map((p) => (
                    <tr key={p.nro_factura} className="border-b border-muted">
                      <td className="px-2 py-1.5 font-mono">
                        {p.nro_factura === 'ANTICIPO' ? (
                          <span className="text-amber-600 font-medium">Anticipo</span>
                        ) : (
                          `#${p.nro_factura}`
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {p.saldo > 0 ? formatUsd(p.saldo) : '-'}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium text-green-600">
                        {formatUsd(p.aplicar)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Registrando...' : `Abonar ${formatUsd(montoUsd)}`}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
