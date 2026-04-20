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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { registrarPagoCxP, type FacturaCompraPendiente } from '../hooks/use-cxp'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd } from '@/lib/currency'

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
  const { tasa } = useTasaActual()

  const [moneda, setMoneda] = useState<'USD' | 'BS'>('USD')
  const [monto, setMonto] = useState('')
  const [metodoCobro, setMetodoCobro] = useState('')
  const [referencia, setReferencia] = useState('')
  const [loading, setLoading] = useState(false)

  function handleClose() {
    setMonto('')
    setMetodoCobro('')
    setReferencia('')
    setMoneda('USD')
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!factura || !user?.empresa_id || !user.id) return

    const montoNum = parseFloat(monto)
    if (isNaN(montoNum) || montoNum <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    if (!metodoCobro) {
      toast.error('Seleccione un metodo de pago')
      return
    }

    const tasaVal = tasa ? parseFloat(tasa.valor) : 1
    const metodo = metodos.find((m) => m.id === metodoCobro)

    setLoading(true)
    try {
      await registrarPagoCxP({
        factura_compra_id: factura.id,
        proveedor_id: proveedorId,
        metodo_cobro_id: metodoCobro,
        banco_empresa_id: metodo?.banco_empresa_id ?? null,
        moneda,
        tasa: tasaVal,
        monto: montoNum,
        referencia: referencia || undefined,
        empresa_id: user.empresa_id,
        usuario_id: user.id,
      })
      toast.success(`Pago registrado: ${formatUsd(montoNum)} ${moneda}`)
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar pago')
    } finally {
      setLoading(false)
    }
  }

  if (!factura) return null

  const saldoPend = parseFloat(factura.saldo_pend_usd)
  const totalFactura = parseFloat(factura.total_usd)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pago CxP</DialogTitle>
        </DialogHeader>

        <div className="mb-4 p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
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
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={moneda} onValueChange={(v) => setMoneda(v as 'USD' | 'BS')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="BS">Bolivares</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Monto</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Metodo de Pago</Label>
            <Select value={metodoCobro} onValueChange={setMetodoCobro}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {metodos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nombre} ({m.moneda})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Referencia (opcional)</Label>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Numero de referencia..."
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Registrando...' : 'Registrar Pago'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
