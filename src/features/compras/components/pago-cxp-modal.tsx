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
import { registrarPagoCxP, type FacturaCompraPendiente } from '../hooks/use-cxp'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import { db } from '@/core/db/powersync/db'
import { localNow } from '@/lib/dates'

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

  const [fechaPago, setFechaPago] = useState(() => localNow().slice(0, 10))
  const [monto, setMonto] = useState('')
  const [metodoCobro, setMetodoCobro] = useState('')
  const [referencia, setReferencia] = useState('')
  // tasa de pago: el usuario puede editar. default = tasa de negociacion de la factura
  const [tasaPagoStr, setTasaPagoStr] = useState('')
  // tasa BCV del documento: solo visible cuando la factura no tenia tasa_costo guardada
  const [tasaBcvStr, setTasaBcvStr] = useState('')
  // tasa interna a la fecha del pago (buscada de tasas_cambio)
  const [tasaInternaNum, setTasaInternaNum] = useState(0)
  const [loading, setLoading] = useState(false)

  // Buscar tasa interna vigente a la fecha del abono
  useEffect(() => {
    if (!user?.empresa_id || !fechaPago) return
    db.execute(
      'SELECT valor FROM tasas_cambio WHERE empresa_id = ? AND fecha <= ? ORDER BY fecha DESC LIMIT 1',
      [user.empresa_id, fechaPago]
    ).then((res) => {
      const row = res.rows?.item(0) as { valor: string } | undefined
      setTasaInternaNum(row ? parseFloat(row.valor) : 0)
    }).catch(() => setTasaInternaNum(0))
  }, [fechaPago, user?.empresa_id])

  function handleClose() {
    setFechaPago(localNow().slice(0, 10))
    setMonto('')
    setMetodoCobro('')
    setReferencia('')
    setTasaPagoStr('')
    setTasaBcvStr('')
    setTasaInternaNum(0)
    onClose()
  }

  if (!factura) return null

  const saldoPend = parseFloat(factura.saldo_pend_usd)
  const totalFactura = parseFloat(factura.total_usd)
  const tasaNegociacion = parseFloat(factura.tasa) || 0
  const tasaCostoDocumento = factura.tasa_costo ? parseFloat(factura.tasa_costo) : null

  // Derivar moneda del metodo seleccionado
  const metodoSeleccionado = metodos.find((m) => m.id === metodoCobro)
  const moneda = (metodoSeleccionado?.moneda ?? 'USD') as 'USD' | 'BS'
  const montoNum = parseFloat(monto) || 0

  // tasa de pago: default a tasa de negociacion del documento
  const tasaPagoNum = parseFloat(tasaPagoStr) || tasaNegociacion

  // tasa BCV para diferencial: del documento si existe, sino del input del usuario
  const tasaBcvParaDiferencial = tasaCostoDocumento ?? (parseFloat(tasaBcvStr) || 0)
  const necesitaTasaBcv = !tasaCostoDocumento

  const montoUsd = moneda === 'BS' ? bsToUsd(montoNum, tasaPagoNum) : montoNum
  const montoBs = moneda === 'USD' ? usdToBs(montoNum, tasaPagoNum) : montoNum

  // USD a tasa interna (para contabilidad, solo en pagos BS)
  const montoUsdInterno = moneda === 'BS' && tasaInternaNum > 0
    ? montoNum / tasaInternaNum
    : null

  const excedeSaldo = montoUsd > saldoPend + 0.01
  const tasaBcvValida = !necesitaTasaBcv || tasaBcvParaDiferencial > 0
  const canSubmit = metodoCobro && montoNum > 0 && !excedeSaldo && !loading
    && tasaPagoNum > 0 && tasaBcvValida

  // diferencial: cuando la tasa de pago difiere de la tasa BCV original del documento
  const hayDiferencial = tasaBcvParaDiferencial > 0 && tasaPagoNum !== tasaBcvParaDiferencial

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
        tasaBcvCompra: tasaBcvParaDiferencial > 0 ? tasaBcvParaDiferencial : undefined,
        tasaInternaPago: tasaInternaNum > 0 ? tasaInternaNum : undefined,
        monto: montoNum,
        fechaPago,
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
          <div className="text-muted-foreground">
            Factura: {factura.nro_factura}
            {' · '}
            <span className="text-xs">Tasa negociacion: {tasaNegociacion > 0 ? tasaNegociacion.toFixed(4) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total factura:</span>
            <span>{formatUsd(totalFactura)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Saldo pendiente:</span>
            <span className="text-destructive">{formatUsd(saldoPend)}</span>
          </div>
          {tasaPagoNum > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Equivalente Bs (a tasa pago):</span>
              <span>{formatBs(usdToBs(saldoPend, tasaPagoNum))}</span>
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
              onChange={(e) => setFechaPago(e.target.value)}
              max={localNow().slice(0, 10)}
            />
            {tasaInternaNum > 0 && (
              <p className="text-xs text-muted-foreground">
                Tasa interna a esta fecha: <span className="font-medium">{tasaInternaNum.toFixed(4)}</span>
              </p>
            )}
          </div>

          {/* Tasa BCV del documento (solo si no estaba guardada) */}
          {necesitaTasaBcv && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 space-y-2">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                Esta factura no tiene tasa BCV/interna registrada.
                Ingrese la tasa BCV vigente en la fecha del documento para calcular el diferencial cambiario.
              </p>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Tasa BCV a la fecha del documento <span className="text-destructive">*</span>
                  <span className="text-muted-foreground font-normal ml-1">({factura.fecha_factura})</span>
                </label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={tasaBcvStr}
                  onChange={(e) => setTasaBcvStr(e.target.value)}
                  placeholder="Ej: 50.0000"
                />
              </div>
            </div>
          )}

          {/* Tasa de pago */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Tasa de pago pactada (Bs/USD)
              </label>
              {tasaValor > 0 && tasaPagoNum !== tasaValor && (
                <button
                  type="button"
                  onClick={() => setTasaPagoStr(tasaValor.toFixed(4))}
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
              value={tasaPagoStr}
              onChange={(e) => setTasaPagoStr(e.target.value)}
              placeholder={tasaNegociacion > 0 ? tasaNegociacion.toFixed(4) : '0.0000'}
            />
            {hayDiferencial && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Diferencial cambiario: tasa BCV doc {tasaBcvParaDiferencial.toFixed(2)} → pago {tasaPagoNum.toFixed(2)}
                {' ('}
                {tasaPagoNum > tasaBcvParaDiferencial ? 'perdida' : 'ganancia'}
                {' Bs '}
                {formatBs(Math.abs(saldoPend * (tasaPagoNum - tasaBcvParaDiferencial)))}
                {' aproximado)'}
              </p>
            )}
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
            {montoNum > 0 && moneda === 'USD' && (
              <p className="text-xs text-muted-foreground">
                Equivale a {formatBs(montoBs)}
              </p>
            )}
            {montoNum > 0 && moneda === 'BS' && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">
                  {formatUsd(montoUsd)} a tasa proveedor {tasaPagoNum.toFixed(2)}
                </p>
                {montoUsdInterno !== null && Math.abs(montoUsdInterno - montoUsd) > 0.005 && (
                  <p className="text-xs text-slate-400">
                    {formatUsd(montoUsdInterno)} a tasa interna {tasaInternaNum.toFixed(2)}
                  </p>
                )}
              </div>
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
