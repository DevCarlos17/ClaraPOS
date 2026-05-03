import { useState, useEffect } from 'react'
import { CheckCircle, Warning, Clock, Handshake, Vault, Bank } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatUsd, formatBs, usdToBs, bsToUsd } from '@/lib/currency'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useMetodosPagoActivos } from '@/features/configuracion/hooks/use-payment-methods'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'
import { db } from '@/core/db/powersync/db'
import { localNow } from '@/lib/dates'
import {
  useHistorialPrestamo,
  registrarAbonoPrestamo,
  type VencimientoPrestamo,
} from '@/features/cxc/hooks/use-cxc'

// ─── Helpers ──────────────────────────────────────────────────

function getDiasRestantes(fechaVenc: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const venc = new Date(fechaVenc + 'T00:00:00')
  return Math.floor((venc.getTime() - today.getTime()) / 86400000)
}

function formatFecha(fecha: string): string {
  try {
    const dateStr = fecha.length === 10 ? fecha + 'T00:00:00' : fecha
    return new Date(dateStr).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return fecha.slice(0, 10)
  }
}

function OrigenFondosBadge({ tipo }: { tipo: string }) {
  if (!tipo || tipo === 'CAJA') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        Caja activa
      </span>
    )
  }
  if (tipo === 'EFECTIVO_EMPRESA') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600">
        <Vault size={11} weight="fill" />
        Efectivo empresa
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-blue-600">
      <Bank size={11} weight="fill" />
      Banco
    </span>
  )
}

function StatusBadge({ status, fechaVenc }: { status: string; fechaVenc: string }) {
  const dias = getDiasRestantes(fechaVenc)
  const isPagado = status === 'PAGADO'
  const isVencido = dias < 0 && status === 'PENDIENTE'
  const isProximo = dias >= 0 && dias <= 7 && status === 'PENDIENTE'
  const diasAbs = Math.abs(dias)

  if (isPagado) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
        <CheckCircle size={12} weight="fill" /> Pagado
      </span>
    )
  }
  if (isVencido) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
          <Warning size={12} weight="fill" /> Vencido
        </span>
        <span className="text-xs text-red-500 pl-1">hace {diasAbs} día{diasAbs !== 1 ? 's' : ''}</span>
      </div>
    )
  }
  if (isProximo) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
          <Clock size={12} weight="fill" /> Próximo a vencer
        </span>
        <span className="text-xs text-amber-500 pl-1">en {diasAbs} día{diasAbs !== 1 ? 's' : ''}</span>
      </div>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
      Pendiente
    </span>
  )
}

// ─── Form Abono Prestamo ──────────────────────────────────────

interface FormAbonoPrestamoProps {
  prestamo: VencimientoPrestamo
  onSuccess: () => void
  onCancel: () => void
}

function FormAbonoPrestamo({ prestamo, onSuccess, onCancel }: FormAbonoPrestamoProps) {
  const { user } = useCurrentUser()
  const { metodos, isLoading: loadingMetodos } = useMetodosPagoActivos()
  const { tasaValor } = useTasaActual()

  const today = localNow().slice(0, 10)
  const [fechaPago, setFechaPago] = useState(today)
  const [tasaStr, setTasaStr] = useState('')
  const [tasaInternaNum, setTasaInternaNum] = useState(0)
  const [metodoCobro, setMetodoCobro] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [referencia, setReferencia] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user?.empresa_id || !fechaPago) return
    db.execute(
      'SELECT valor FROM tasas_cambio WHERE empresa_id = ? AND DATE(fecha) <= ? ORDER BY fecha DESC, created_at DESC LIMIT 1',
      [user.empresa_id, fechaPago]
    ).then((res) => {
      const row = res.rows?.item(0) as { valor: string } | undefined
      const val = row ? parseFloat(row.valor) : 0
      setTasaInternaNum(val)
      setTasaStr(val > 0 ? val.toFixed(4) : '')
    }).catch(() => {
      setTasaInternaNum(0)
      setTasaStr('')
    })
  }, [fechaPago, user?.empresa_id])

  const saldoPendiente = parseFloat(prestamo.saldo_pendiente_usd)
  const metodoSeleccionado = metodos.find((m) => m.id === metodoCobro)
  const moneda = (metodoSeleccionado?.moneda ?? 'USD') as 'USD' | 'BS'
  const montoNum = parseFloat(montoStr) || 0
  const tasaNum = parseFloat(tasaStr) || 0
  const montoUsd = moneda === 'BS' ? bsToUsd(montoNum, tasaNum) : montoNum
  const excedeSaldo = montoUsd > saldoPendiente + 0.01

  function handlePayMax() {
    if (moneda === 'BS') {
      setMontoStr(usdToBs(saldoPendiente, tasaNum > 0 ? tasaNum : tasaValor).toFixed(2))
    } else {
      setMontoStr(saldoPendiente.toFixed(2))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user?.empresa_id || !user.id) return
    setSubmitting(true)
    try {
      await registrarAbonoPrestamo({
        vencimiento_id: prestamo.id,
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
      toast.success(`Abono de ${formatUsd(montoUsd)} registrado al préstamo`)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar abono')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Fecha del abono</label>
          <input
            type="date"
            value={fechaPago}
            onChange={(e) => { setFechaPago(e.target.value); setMontoStr('') }}
            max={today}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">Tasa (Bs/USD)</label>
            {tasaValor > 0 && tasaNum !== tasaValor && (
              <button
                type="button"
                onClick={() => setTasaStr(tasaValor.toFixed(4))}
                className="text-[10px] text-purple-600 hover:underline"
              >
                Usar actual ({tasaValor.toFixed(2)})
              </button>
            )}
          </div>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={tasaStr}
            onChange={(e) => setTasaStr(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            placeholder="0.0000"
            className="no-spinner w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          {tasaInternaNum > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Tasa a esta fecha: {tasaInternaNum.toFixed(4)}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Metodo de cobro</label>
        <select
          value={metodoCobro}
          onChange={(e) => { setMetodoCobro(e.target.value); setMontoStr('') }}
          disabled={loadingMetodos}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50"
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
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">Monto ({moneda})</label>
          <button
            type="button"
            onClick={handlePayMax}
            disabled={tasaNum <= 0}
            className="text-[10px] text-purple-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Pagar total ({formatUsd(saldoPendiente)})
          </button>
        </div>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={montoStr}
          onChange={(e) => setMontoStr(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0.00"
          className="no-spinner w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {montoNum > 0 && moneda === 'USD' && tasaNum > 0 && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Equivale a {formatBs(usdToBs(montoNum, tasaNum))} a tasa {tasaNum.toFixed(2)}
          </p>
        )}
        {montoNum > 0 && moneda === 'BS' && tasaNum > 0 && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Equivale a {formatUsd(montoUsd)} a tasa {tasaNum.toFixed(2)}
          </p>
        )}
        {excedeSaldo && (
          <p className="text-xs text-red-500 mt-1">El abono excede el saldo pendiente del préstamo</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Referencia (opcional)
        </label>
        <input
          type="text"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder="Nro. transferencia, etc."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      <div className="flex gap-2 justify-end pt-1 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={submitting || !metodoCobro || montoNum <= 0 || tasaNum <= 0 || excedeSaldo}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          {submitting ? 'Registrando...' : `Registrar ${formatUsd(montoUsd)}`}
        </Button>
      </div>
    </form>
  )
}

// ─── Props ────────────────────────────────────────────────────

interface PrestamoDetalleModalProps {
  isOpen: boolean
  onClose: () => void
  prestamo: VencimientoPrestamo | null
}

// ─── Componente ───────────────────────────────────────────────

export function PrestamoDetalleModal({ isOpen, onClose, prestamo }: PrestamoDetalleModalProps) {
  const { historial, isLoading } = useHistorialPrestamo(prestamo?.id ?? null)
  const [showAbonoForm, setShowAbonoForm] = useState(false)

  if (!prestamo) return null

  const montoOriginal = parseFloat(prestamo.monto_original_usd)
  const montoPagado = parseFloat(prestamo.monto_pagado_usd)
  const saldoPend = parseFloat(prestamo.saldo_pendiente_usd)
  const porcentajePagado = montoOriginal > 0 ? (montoPagado / montoOriginal) * 100 : 0

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) { setShowAbonoForm(false); onClose() } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-100 shrink-0">
              <Handshake size={16} className="text-purple-600" />
            </div>
            <div>
              <DialogTitle>Detalle de Préstamo</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cuota {prestamo.nro_cuota}
                {prestamo.nro_factura ? ` · Factura #${prestamo.nro_factura}` : ' · Sin factura asociada'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">

          {/* ── Encabezado del préstamo ─────────────────── */}
          <div className="rounded-lg bg-purple-50/60 border border-purple-200/60 p-4 space-y-3">
            <div>
              <div className="text-base font-semibold text-foreground">
                {prestamo.cliente_nombre}
              </div>
              <div className="text-xs text-muted-foreground">
                {prestamo.nro_factura
                  ? `Factura de referencia: #${prestamo.nro_factura}`
                  : 'Sin factura asociada'
                }
              </div>
            </div>

            <div className="flex items-start justify-between">
              <StatusBadge status={prestamo.status} fechaVenc={prestamo.fecha_vencimiento} />
              <div className="text-right text-xs text-muted-foreground space-y-1">
                <div>
                  <div>Fecha vencimiento</div>
                  <div className="font-medium text-foreground">{formatFecha(prestamo.fecha_vencimiento)}</div>
                </div>
                <OrigenFondosBadge tipo={prestamo.origen_fondos_tipo} />
              </div>
            </div>

            {/* Montos */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="rounded-md bg-white/80 border border-purple-100 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Total c/interés</div>
                <div className="font-semibold text-sm">{formatUsd(montoOriginal)}</div>
              </div>
              <div className="rounded-md bg-white/80 border border-purple-100 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Pagado</div>
                <div className="font-semibold text-sm text-green-600">{formatUsd(montoPagado)}</div>
              </div>
              <div className="rounded-md bg-white/80 border border-purple-100 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground mb-0.5">Saldo pendiente</div>
                <div className={`font-semibold text-sm ${saldoPend > 0.005 ? 'text-destructive' : 'text-green-600'}`}>
                  {saldoPend > 0.005 ? formatUsd(saldoPend) : '—'}
                </div>
              </div>
            </div>

            {/* Barra de progreso */}
            {montoPagado > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progreso de pago</span>
                  <span>{porcentajePagado.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-purple-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all"
                    style={{ width: `${Math.min(100, porcentajePagado)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Historial de abonos ─────────────────────── */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Historial de Abonos
            </h4>

            {isLoading ? (
              <div className="h-20 bg-muted/50 rounded animate-pulse" />
            ) : historial.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Sin abonos registrados</p>
            ) : (
              <div className="overflow-auto rounded-md border max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Método</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Abono</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Saldo antes</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Saldo después</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {historial.map((a) => {
                      const saldoAntes = parseFloat(a.saldo_anterior)
                      const saldoDespues = parseFloat(a.saldo_nuevo)
                      const monto = parseFloat(a.monto)
                      return (
                        <tr key={a.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {formatFecha(a.fecha)}
                          </td>
                          <td className="px-3 py-2">{a.metodo_nombre}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-green-600">
                            {formatUsd(monto)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {saldoAntes > 0 ? formatUsd(saldoAntes) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {saldoDespues > 0.005
                              ? <span className="text-orange-600">{formatUsd(saldoDespues)}</span>
                              : <span className="text-green-600 font-medium">Saldado</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {historial.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Total abonado
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-green-600 tabular-nums">
                          {formatUsd(historial.reduce((s, a) => s + parseFloat(a.monto), 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* ── Concepto de cada abono (si existe) ─────── */}
          {historial.some((a) => a.concepto) && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Notas de abonos
              </h4>
              <div className="space-y-1">
                {historial.map((a) => a.concepto ? (
                  <p key={a.id} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{formatFecha(a.fecha)}:</span>{' '}
                    {a.concepto}
                  </p>
                ) : null)}
              </div>
            </div>
          )}

          {/* ── Formulario de abono ─────────────────────── */}
          {showAbonoForm && prestamo.status !== 'PAGADO' && (
            <div className="rounded-lg bg-purple-50/40 border border-purple-200/60 p-4">
              <h4 className="text-xs font-semibold text-purple-800 uppercase tracking-wide mb-3">
                Registrar Abono
              </h4>
              <FormAbonoPrestamo
                prestamo={prestamo}
                onSuccess={() => setShowAbonoForm(false)}
                onCancel={() => setShowAbonoForm(false)}
              />
            </div>
          )}

          {/* ── Footer ─────────────────────────────────── */}
          <div className="flex justify-between items-center pt-3 border-t border-border">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            {!showAbonoForm && prestamo.status !== 'PAGADO' && saldoPend > 0.005 && (
              <Button
                onClick={() => setShowAbonoForm(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Registrar Abono
              </Button>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
