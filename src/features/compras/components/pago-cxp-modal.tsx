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
import { registrarPagoCxP, registrarDiferencialCxP, type FacturaCompraPendiente } from '../hooks/use-cxp'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import Decimal from 'decimal.js'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import { db } from '@/core/db/powersync/db'
import { localNow } from '@/lib/dates'
import { NativeSelect } from '@/components/ui/native-select'

interface PagoCxPModalProps {
  open: boolean
  onClose: () => void
  factura: FacturaCompraPendiente | null
  proveedorId: string
  proveedorNombre: string
}

interface MicroBalance {
  saldoUsd: Decimal
  saldoBs: Decimal
  tasaPago: number
  nroFactura: string
}

export function PagoCxPModal({ open, onClose, factura, proveedorId, proveedorNombre }: PagoCxPModalProps) {
  const { user } = useCurrentUser()
  const { metodos } = useMetodosPagoActivos()
  const { tasaValor } = useTasaActual()

  const [fechaPago, setFechaPago] = useState(() => localNow().slice(0, 10))
  const [monto, setMonto] = useState('')
  const [metodoCobro, setMetodoCobro] = useState('')
  const [referencia, setReferencia] = useState('')
  const [tasaPagoStr, setTasaPagoStr] = useState('')
  const [tasaBcvStr, setTasaBcvStr] = useState('')
  const [tasaInternaNum, setTasaInternaNum] = useState(0)
  const [loading, setLoading] = useState(false)
  const [microBalance, setMicroBalance] = useState<MicroBalance | null>(null)
  const [loadingDiferencial, setLoadingDiferencial] = useState(false)

  useEffect(() => {
    if (!user?.empresa_id || !fechaPago) return
    db.execute(
      'SELECT valor FROM tasas_cambio WHERE empresa_id = ? AND DATE(fecha) <= ? ORDER BY fecha DESC, created_at DESC LIMIT 1',
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
    setMicroBalance(null)
    setLoadingDiferencial(false)
    onClose()
  }

  async function handleDiferencial() {
    if (!factura || !user?.empresa_id || !user.id) return
    setLoadingDiferencial(true)
    try {
      await registrarDiferencialCxP({
        facturaCompraId: factura.id,
        proveedorId,
        empresaId: user.empresa_id,
        usuarioId: user.id,
        tasa: microBalance?.tasaPago ?? tasaPagoNum,
      })
      toast.success(`Diferencial cambiario registrado. Factura ${factura.nro_factura} saldada.`)
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar diferencial cambiario')
    } finally {
      setLoadingDiferencial(false)
    }
  }

  if (!factura) return null

  const dSaldoPend = new Decimal(factura.saldo_pend_usd || '0')
  const saldoPend = dSaldoPend.toNumber()
  const totalFactura = new Decimal(factura.total_usd || '0').toNumber()
  const tasaNegociacion = parseFloat(factura.tasa) || 0
  const tasaCostoDocumento = factura.tasa_costo ? parseFloat(factura.tasa_costo) : null

  // El saldo es sub-centavo USD (< $0.01) — no pagable en USD
  const esSaldoSubCentavo = dSaldoPend.gt(0) && dSaldoPend.lt(new Decimal('0.01'))

  const metodoSeleccionado = metodos.find((m) => m.id === metodoCobro)
  const moneda = (metodoSeleccionado?.moneda ?? 'USD') as 'USD' | 'BS'
  const montoNum = parseFloat(monto) || 0

  const tasaPagoNum = parseFloat(tasaPagoStr) || tasaNegociacion

  const tasaBcvParaDiferencial = tasaCostoDocumento ?? (parseFloat(tasaBcvStr) || 0)
  const necesitaTasaBcv = !tasaCostoDocumento

  const montoUsd = moneda === 'BS' ? bsToUsd(montoNum, tasaPagoNum).toNumber() : montoNum
  const montoBs = moneda === 'USD' ? usdToBs(montoNum, tasaPagoNum).toNumber() : montoNum

  const montoUsdInterno = moneda === 'BS' && tasaInternaNum > 0
    ? bsToUsd(montoNum, tasaInternaNum).toNumber()
    : null

  const excedeSaldo = montoUsd > saldoPend + 0.01
  const tasaBcvValida = !necesitaTasaBcv || tasaBcvParaDiferencial > 0
  const canSubmit = metodoCobro && montoNum > 0 && !excedeSaldo && !loading
    && tasaPagoNum > 0 && tasaBcvValida

  const hayDiferencial = tasaBcvParaDiferencial > 0 && tasaPagoNum !== tasaBcvParaDiferencial

  // Residual sub-centavo que quedaria luego del pago
  const dMontoUsd = new Decimal(montoUsd)
  const saldoResultante = dSaldoPend.minus(dMontoUsd)
  const quedaMicroBalance = !excedeSaldo && montoNum > 0
    && saldoResultante.gt(new Decimal('0'))
    && saldoResultante.lt(new Decimal('0.01'))
  const residualBs = quedaMicroBalance
    ? saldoResultante.times(new Decimal(tasaPagoNum))
    : new Decimal('0')

  function handlePayMax() {
    if (moneda === 'BS') {
      setMonto(usdToBs(saldoPend, tasaPagoNum).toFixed(2))
    } else {
      // En USD no se puede pagar sub-centavo. Si el saldo exacto > $0.01 se usa
      // la precision completa. Si es sub-centavo, el campo queda bloqueado (ver abajo).
      const exacto = dSaldoPend
      setMonto(exacto.gte(new Decimal('0.01')) ? exacto.toDecimalPlaces(2).toFixed(2) : '0.01')
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

      const saldoRestante = dSaldoPend.minus(new Decimal(montoUsd))

      if (saldoRestante.gt(new Decimal('0')) && saldoRestante.lt(new Decimal('0.01'))) {
        toast.success(`Pago de ${formatUsd(montoUsd)} registrado`)
        setMicroBalance({
          saldoUsd: saldoRestante,
          saldoBs: saldoRestante.times(new Decimal(tasaPagoNum)),
          tasaPago: tasaPagoNum,
          nroFactura: factura!.nro_factura,
        })
      } else {
        toast.success(`Pago de ${formatUsd(montoUsd)} registrado a factura ${factura!.nro_factura}`)
        handleClose()
      }
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

        {/* ── Panel de micro-saldo residual post-pago ── */}
        {microBalance ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 space-y-2">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Pago registrado. Queda un residual sub-centavo:
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                  {formatBs(microBalance.saldoBs.toNumber())}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                  = {microBalance.saldoUsd.toFixed(8)} USD @ {microBalance.tasaPago.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Este monto no es pagable en USD (menor a $0.01).
              </p>
            </div>
            <p className="text-sm font-medium text-foreground">¿Qué hacemos con este residual?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleDiferencial}
                disabled={loadingDiferencial}
                className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/30"
              >
                {loadingDiferencial ? 'Procesando...' : 'Diferencial cambiario'}
              </Button>
              <Button variant="outline" onClick={handleClose} disabled={loadingDiferencial}>
                Dejar pendiente en Bs
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Diferencial cambiario:</strong> cierra la factura asumiendo la diferencia como perdida/ganancia cambiaria.<br />
              <strong>Dejar pendiente:</strong> la factura queda en CxP con {formatBs(microBalance.saldoBs.toNumber())} adeudados, pagables en Bs.
            </p>
          </div>
        ) : (
          <>
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
                <div className="text-right">
                  {esSaldoSubCentavo ? (
                    <>
                      <span className="text-amber-600 dark:text-amber-400 font-mono text-xs">
                        {dSaldoPend.toFixed(8)} USD
                      </span>
                      {tasaPagoNum > 0 && (
                        <div className="text-destructive">
                          {formatBs(usdToBs(saldoPend, tasaPagoNum))}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-destructive">{formatUsd(saldoPend)}</span>
                  )}
                </div>
              </div>
              {!esSaldoSubCentavo && tasaPagoNum > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Equivalente Bs (a tasa pago):</span>
                  <span>{formatBs(usdToBs(saldoPend, tasaPagoNum))}</span>
                </div>
              )}
              {esSaldoSubCentavo && (
                <p className="text-xs text-amber-600 dark:text-amber-400 pt-1 border-t border-amber-200 dark:border-amber-800">
                  Saldo sub-centavo — usa un metodo de pago en Bs para saldar este monto
                </p>
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
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {hayDiferencial && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Diferencial cambiario: tasa BCV doc {tasaBcvParaDiferencial.toFixed(2)} → pago {tasaPagoNum.toFixed(2)}
                    {' ('}
                    {tasaPagoNum > tasaBcvParaDiferencial ? 'perdida' : 'ganancia'}
                    {' Bs '}
                    {formatBs(new Decimal(saldoPend).times(new Decimal(tasaPagoNum).minus(new Decimal(tasaBcvParaDiferencial))).abs())}
                    {' aproximado)'}
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
                    setMonto('')
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
                    disabled={esSaldoSubCentavo && moneda === 'USD'}
                    className="text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
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
                {quedaMicroBalance && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Quedara un residual de {formatBs(residualBs.toNumber())}
                    {' '}({saldoResultante.toFixed(8)} USD — sub-centavo, pagable en Bs)
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
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
