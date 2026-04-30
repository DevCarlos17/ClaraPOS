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
import { registrarPagoGasto, type GastoPendiente } from '@/features/contabilidad/hooks/use-gastos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import { db } from '@/core/db/powersync/db'
import { localNow } from '@/lib/dates'

interface PagoGastoCxpModalProps {
  open: boolean
  onClose: () => void
  gasto: GastoPendiente | null
  proveedorId: string
  proveedorNombre: string
}

export function PagoGastoCxpModal({
  open, onClose, gasto, proveedorId, proveedorNombre,
}: PagoGastoCxpModalProps) {
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { tasaValor } = useTasaActual()

  const [fechaPago, setFechaPago] = useState(() => localNow().slice(0, 10))
  const [monto, setMonto] = useState('')
  const [metodoCobro, setMetodoCobro] = useState('')
  const [referencia, setReferencia] = useState('')
  const [tasaPagoStr, setTasaPagoStr] = useState('')
  const [tasaInternaNum, setTasaInternaNum] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.empresa_id || !fechaPago) return
    // DATE(fecha) strips the time component so that tasas creadas hoy (stored as
    // 'YYYY-MM-DD HH:mm:ss') sean encontradas correctamente cuando fechaPago='YYYY-MM-DD'
    db.execute(
      'SELECT valor FROM tasas_cambio WHERE empresa_id = ? AND DATE(fecha) <= ? ORDER BY fecha DESC, created_at DESC LIMIT 1',
      [user.empresa_id, fechaPago]
    ).then((res) => {
      const row = res.rows?.item(0) as { valor: string } | undefined
      const valor = row ? parseFloat(row.valor) : 0
      setTasaInternaNum(valor)
      // Auto-poblar la tasa de pago con la tasa BCV actual si el usuario no la cambio
      // y el gasto no usa tasa paralela negociada
      if (valor > 0 && !tasaPagoStr && !gasto?.usa_tasa_paralela) {
        setTasaPagoStr(valor.toFixed(4))
      }
    }).catch(() => setTasaInternaNum(0))
  }, [fechaPago, user?.empresa_id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    setFechaPago(localNow().slice(0, 10))
    setMonto('')
    setMetodoCobro('')
    setReferencia('')
    setTasaPagoStr('')
    setTasaInternaNum(0)
    onClose()
  }

  if (!gasto) return null

  const saldoPend = parseFloat(gasto.saldo_pendiente_usd)
  const totalGasto = parseFloat(gasto.monto_usd)
  // Tasa de negociacion: paralela si aplica, sino interna del documento
  const tasaNegociacion = gasto.usa_tasa_paralela && gasto.tasa_proveedor
    ? parseFloat(gasto.tasa_proveedor)
    : parseFloat(gasto.tasa) || 0

  const metodoSeleccionado = metodos.find((m) => m.id === metodoCobro)
  const moneda = (metodoSeleccionado?.moneda ?? 'USD') as 'USD' | 'BS'
  const montoNum = parseFloat(monto) || 0

  const tasaPagoNum = parseFloat(tasaPagoStr) || tasaNegociacion

  const montoUsd = moneda === 'BS' ? bsToUsd(montoNum, tasaPagoNum) : montoNum
  const montoBs = moneda === 'USD' ? usdToBs(montoNum, tasaPagoNum) : montoNum

  const montoUsdInterno = moneda === 'BS' && tasaInternaNum > 0
    ? montoNum / tasaInternaNum
    : null

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
      await registrarPagoGasto({
        gasto_id: gasto!.id,
        proveedor_id: proveedorId,
        metodo_cobro_id: metodoCobro,
        banco_empresa_id: metodoSeleccionado?.banco_empresa_id ?? null,
        moneda,
        tasa: tasaPagoNum,
        tasaInternaPago: tasaInternaNum > 0 ? tasaInternaNum : undefined,
        monto: montoNum,
        fechaPago,
        referencia: referencia || undefined,
        empresa_id: user.empresa_id,
        usuario_id: user.id,
      })
      toast.success(`Pago de ${formatUsd(montoUsd)} registrado al gasto ${gasto!.nro_gasto}`)
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
          <DialogTitle>Registrar Pago — Gasto</DialogTitle>
        </DialogHeader>

        {/* Resumen del gasto */}
        <div className="p-3 rounded-lg bg-muted/50 space-y-1 text-sm">
          <div className="font-medium">{proveedorNombre}</div>
          <div className="text-muted-foreground text-xs">
            {gasto.nro_gasto}
            {gasto.nro_factura && ` · Fact. ${gasto.nro_factura}`}
            {' · '}
            <span>Tasa: {tasaNegociacion > 0 ? tasaNegociacion.toFixed(4) : '—'}</span>
          </div>
          <div className="text-xs text-muted-foreground truncate">{gasto.descripcion}</div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total gasto:</span>
            <span>{formatUsd(totalGasto)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Saldo pendiente:</span>
            <span className="text-destructive">{formatUsd(saldoPend)}</span>
          </div>
          {tasaPagoNum > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Equivalente Bs:</span>
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

          {/* Tasa de pago */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Tasa de pago (Bs/USD)
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
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
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
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {montoNum > 0 && moneda === 'USD' && (
              <p className="text-xs text-muted-foreground">
                Equivale a {formatBs(montoBs)}
              </p>
            )}
            {montoNum > 0 && moneda === 'BS' && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">
                  {formatUsd(montoUsd)} a tasa {tasaPagoNum.toFixed(2)}
                </p>
                {montoUsdInterno !== null && Math.abs(montoUsdInterno - montoUsd) > 0.005 && (
                  <p className="text-xs text-slate-400">
                    Abono contable: {formatBs(montoNum)} / {tasaInternaNum.toFixed(4)} = {formatUsd(montoUsdInterno)}
                  </p>
                )}
              </div>
            )}
            {excedeSaldo && (
              <p className="text-xs text-destructive">
                El monto excede el saldo pendiente del gasto
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
