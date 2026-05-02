import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import { registrarPagoFactura, type VentaPendiente } from '../hooks/use-cxc'
import { db } from '@/core/db/powersync/db'
import { localNow } from '@/lib/dates'

interface PagoFacturaModalProps {
  isOpen: boolean
  onClose: () => void
  factura: VentaPendiente | null
  clienteId: string
  clienteNombre?: string
  onSuccess: () => void
}

export function PagoFacturaModal({
  isOpen,
  onClose,
  factura,
  clienteId,
  clienteNombre,
  onSuccess,
}: PagoFacturaModalProps) {
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { tasaValor } = useTasaActual()

  const today = localNow().slice(0, 10)

  const [fechaPago, setFechaPago] = useState(today)
  const [tasaStr, setTasaStr] = useState('')
  const [metodoCobro, setMetodoCobro] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [referencia, setReferencia] = useState('')
  // Tasa interna auto-cargada de la DB para la fecha seleccionada
  const [tasaInternaNum, setTasaInternaNum] = useState(0)
  const [loading, setLoading] = useState(false)

  // Auto-cargar tasa interna de la DB cada vez que cambia la fecha
  useEffect(() => {
    if (!user?.empresa_id || !fechaPago) return
    db.execute(
      'SELECT valor FROM tasas_cambio WHERE empresa_id = ? AND DATE(fecha) <= ? ORDER BY fecha DESC, created_at DESC LIMIT 1',
      [user.empresa_id, fechaPago]
    ).then((res) => {
      const row = res.rows?.item(0) as { valor: string } | undefined
      const val = row ? parseFloat(row.valor) : 0
      setTasaInternaNum(val)
      // Pre-llenar la tasa editable con el valor encontrado
      setTasaStr(val > 0 ? val.toFixed(4) : '')
    }).catch(() => {
      setTasaInternaNum(0)
      setTasaStr('')
    })
  }, [fechaPago, user?.empresa_id])

  // Resetear form al abrir
  useEffect(() => {
    if (isOpen) {
      setFechaPago(today)
      setMetodoCobro('')
      setMontoStr('')
      setReferencia('')
      // La tasa se cargará por el efecto de fechaPago
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setFechaPago(today)
    setTasaStr('')
    setMetodoCobro('')
    setMontoStr('')
    setReferencia('')
    setTasaInternaNum(0)
    onClose()
  }

  if (!factura) return null

  const saldoPend = parseFloat(factura.saldo_pend_usd)
  const totalFactura = parseFloat(factura.total_usd)

  const metodoSeleccionado = metodos.find((m) => m.id === metodoCobro)
  const moneda = (metodoSeleccionado?.moneda ?? 'USD') as 'USD' | 'BS'
  const montoNum = parseFloat(montoStr) || 0
  const tasaNum = parseFloat(tasaStr) || 0

  // Para pago USD: monto directo. Para pago BS: se divide por la tasa
  const montoUsd = moneda === 'BS' ? bsToUsd(montoNum, tasaNum) : montoNum
  const montoBs = moneda === 'USD' ? usdToBs(montoNum, tasaNum) : montoNum

  const excedeSaldo = montoUsd > saldoPend + 0.01
  const sinTasa = tasaNum <= 0
  const canSubmit = metodoCobro && montoNum > 0 && !excedeSaldo && !loading && tasaNum > 0

  function handlePayMax() {
    if (moneda === 'BS') {
      setMontoStr(usdToBs(saldoPend, tasaNum > 0 ? tasaNum : tasaValor).toFixed(2))
    } else {
      setMontoStr(saldoPend.toFixed(2))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !user?.empresa_id || !user.id) return

    setLoading(true)
    try {
      await registrarPagoFactura({
        venta_id: factura!.id,
        cliente_id: clienteId,
        metodo_cobro_id: metodoCobro,
        moneda,
        tasa: tasaNum,
        monto: montoNum,
        fechaPago,
        referencia: referencia.trim() || undefined,
        empresa_id: user.empresa_id,
        procesado_por: user.id,
        procesado_por_nombre: user.nombre,
      })
      toast.success(`Pago de ${formatUsd(montoUsd)} registrado a factura ${factura!.nro_factura}`)
      onSuccess()
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar pago')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pago CxC</DialogTitle>
        </DialogHeader>

        {/* Resumen de la factura */}
        <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
          {clienteNombre && (
            <div className="font-medium">{clienteNombre}</div>
          )}
          <div className="text-muted-foreground text-xs">
            Factura: #{factura.nro_factura}
            {' · '}
            <span>Tasa factura: {parseFloat(factura.tasa).toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total factura:</span>
            <span>{formatUsd(totalFactura)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Saldo pendiente:</span>
            <span className="text-destructive">{formatUsd(saldoPend)}</span>
          </div>
          {tasaNum > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Equivalente Bs (a tasa cobro):</span>
              <span>{formatBs(usdToBs(saldoPend, tasaNum))}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Fecha del abono */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fecha del abono</label>
            <Input
              type="date"
              value={fechaPago}
              onChange={(e) => {
                setFechaPago(e.target.value)
                setMontoStr('')
              }}
              max={today}
            />
            {tasaInternaNum > 0 && (
              <p className="text-xs text-muted-foreground">
                Tasa interna a esta fecha:{' '}
                <span className="font-medium">{tasaInternaNum.toFixed(4)}</span>
              </p>
            )}
          </div>

          {/* Aviso cuando no hay tasa para la fecha */}
          {tasaInternaNum === 0 && fechaPago && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
              <p className="text-xs text-amber-700 font-medium">
                No hay tasa registrada para esta fecha. Ingrese la tasa manualmente.
              </p>
            </div>
          )}

          {/* Tasa de cobro (editable) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Tasa de cobro (Bs/USD)
              </label>
              {tasaValor > 0 && tasaNum !== tasaValor && (
                <button
                  type="button"
                  onClick={() => setTasaStr(tasaValor.toFixed(4))}
                  className="text-xs text-primary hover:underline"
                >
                  Usar tasa actual ({tasaValor.toFixed(2)})
                </button>
              )}
            </div>
            <Input
              type="number"
              step="0.0001"
              min="0.0001"
              value={tasaStr}
              onChange={(e) => setTasaStr(e.target.value)}
              placeholder="0.0000"
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {sinTasa && (
              <p className="text-xs text-destructive">
                Se requiere la tasa de cambio para registrar el pago
              </p>
            )}
          </div>

          {/* Metodo de pago */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Metodo de pago</label>
            <NativeSelect
              value={metodoCobro}
              onChange={(e) => {
                setMetodoCobro(e.target.value)
                setMontoStr('')
              }}
            >
              <option value="">Seleccionar...</option>
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.moneda})
                </option>
              ))}
            </NativeSelect>
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
              value={montoStr}
              onChange={(e) => setMontoStr(e.target.value)}
              placeholder="0.00"
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {montoNum > 0 && moneda === 'USD' && tasaNum > 0 && (
              <p className="text-xs text-muted-foreground">
                Equivale a {formatBs(montoBs)} a tasa {tasaNum.toFixed(2)}
              </p>
            )}
            {montoNum > 0 && moneda === 'BS' && tasaNum > 0 && (
              <p className="text-xs text-muted-foreground">
                Equivale a {formatUsd(montoUsd)} a tasa {tasaNum.toFixed(2)}
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
