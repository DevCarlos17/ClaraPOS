import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { registrarPagoCxP, type FacturaCompraPendiente } from '../hooks/use-cxp'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'

interface PagoCxPModalProps {
  open: boolean
  onClose: () => void
  factura: FacturaCompraPendiente | null
  proveedorId: string
  proveedorNombre: string
}

export function PagoCxPModal({ open, onClose, factura, proveedorId, proveedorNombre }: PagoCxPModalProps) {
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { tasaValor } = useTasaActual()

  const [monto, setMonto] = useState('')
  const [metodoCobro, setMetodoCobro] = useState('')
  const [referencia, setReferencia] = useState('')
  const [tasaPagoStr, setTasaPagoStr] = useState('')
  const [loading, setLoading] = useState(false)

  function handleClose() {
    setMonto('')
    setMetodoCobro('')
    setReferencia('')
    setTasaPagoStr('')
    onClose()
  }

  if (!factura) return null

  const saldoPend = parseFloat(factura.saldo_pend_usd)
  const totalFactura = parseFloat(factura.total_usd)

  // Derivar moneda del metodo seleccionado (igual que CxC)
  const metodoSeleccionado = metodos.find((m) => m.id === metodoCobro)
  const moneda = (metodoSeleccionado?.moneda ?? 'USD') as 'USD' | 'BS'
  const montoNum = parseFloat(monto) || 0
  // tasa de pago: editable por usuario, default = tasa actual del sistema
  const tasaPagoNum = parseFloat(tasaPagoStr) || tasaValor

  const montoUsd = moneda === 'BS' ? bsToUsd(montoNum, tasaPagoNum) : montoNum
  const montoBs = moneda === 'USD' ? usdToBs(montoNum, tasaPagoNum) : montoNum

  const excedeSaldo = montoUsd > saldoPend + 0.01
  const canSubmit = metodoCobro && montoNum > 0 && !excedeSaldo && !loading && tasaPagoNum > 0

  function handlePayMax() {
    if (moneda === 'BS') {
      setMonto(usdToBs(saldoPend, tasaPagoNum).toFixed(2))
    } else {
      setMonto(saldoPend.toFixed(2))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !user?.empresa_id || !user.id) return

    setLoading(true)
    try {
      await registrarPagoCxP({
        factura_compra_id: factura!.id,
        proveedor_id: proveedorId,
        metodo_cobro_id: metodoCobro,
        banco_empresa_id: metodoSeleccionado?.banco_empresa_id ?? null,
        moneda,
        tasa: tasaPagoNum,
        monto: montoNum,
        referencia: referencia || undefined,
        empresa_id: user.empresa_id,
        usuario_id: user.id,
      })
      toast.success(`Pago de ${formatUsd(montoUsd)} registrado a factura ${factura!.nro_factura}`)
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pago CxP</DialogTitle>
        </DialogHeader>

        {/* Resumen de la factura */}
        <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
          <div className="font-medium">{proveedorNombre}</div>
          <div className="text-muted-foreground">Factura: {factura.nro_factura}</div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total factura:</span>
            <span>{formatUsd(totalFactura)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Saldo pendiente:</span>
            <span className="text-destructive">{formatUsd(saldoPend)}</span>
          </div>
          {tasaPagoNum > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Equivalente Bs:</span>
              <span className="text-muted-foreground">{formatBs(usdToBs(saldoPend, tasaPagoNum))}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tasa de pago */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Tasa de pago (Bs/USD)
              </label>
              {tasaValor > 0 && tasaPagoStr && parseFloat(tasaPagoStr) !== tasaValor && (
                <button
                  type="button"
                  onClick={() => setTasaPagoStr('')}
                  className="text-xs text-primary hover:underline"
                >
                  Usar tasa actual
                </button>
              )}
            </div>
            <Input
              type="number"
              step="0.0001"
              min="0.0001"
              value={tasaPagoStr}
              onChange={(e) => setTasaPagoStr(e.target.value)}
              placeholder={tasaValor > 0 ? tasaValor.toFixed(4) : '0.0000'}
            />
            <p className="text-xs text-muted-foreground">
              Tasa vigente: {tasaValor > 0 ? tasaValor.toFixed(4) : '—'}
              {tasaPagoNum !== tasaValor && tasaPagoNum > 0 && (
                <span className="text-amber-600 ml-2">⚠ Diferencial cambiario se registrara en contabilidad</span>
              )}
            </p>
          </div>

          {/* Metodo de pago */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Metodo de pago</label>
            <select
              value={metodoCobro}
              onChange={(e) => {
                setMetodoCobro(e.target.value)
                setMonto('')
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
          <div className="space-y-1.5">
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
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
            />
            {montoNum > 0 && (
              <p className="text-xs text-muted-foreground">
                {moneda === 'USD'
                  ? `Equivale a ${formatBs(montoBs)}`
                  : `Equivale a ${formatUsd(montoUsd)}`}
              </p>
            )}
            {excedeSaldo && (
              <p className="text-xs text-destructive">
                El monto excede el saldo pendiente de la factura
              </p>
            )}
          </div>

          {/* Referencia */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Referencia (opcional)
            </label>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Nro. transferencia, etc."
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {loading ? 'Registrando...' : `Pagar ${formatUsd(montoUsd)}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
