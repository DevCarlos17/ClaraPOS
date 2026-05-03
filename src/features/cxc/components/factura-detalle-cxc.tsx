import { useState } from 'react'
import { useQuery } from '@powersync/react'
import { ArrowCounterClockwise, Wallet, Handshake, CheckCircle, Warning, Clock } from '@phosphor-icons/react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SupervisorPinDialog } from '@/components/ui/supervisor-pin-dialog'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import {
  useDetalleFactura,
  usePagosFactura,
  useCargosEspecialesVenta,
  useVencimientosVenta,
  registrarReversoAbono,
  type VentaPendiente,
  type PagoFacturaCxc,
  type VencimientoVenta,
} from '../hooks/use-cxc'
import { PagoFacturaModal } from './pago-factura-modal'

// ─── Tipos internos ───────────────────────────────────────────

interface VentaExtraRow {
  status: string
  procesado_por_nombre: string | null
  cliente_nombre: string | null
  cliente_identificacion: string | null
}

// ─── Dialogo de motivo de reverso ─────────────────────────────

interface ReversarAbonoDialogProps {
  open: boolean
  pago: PagoFacturaCxc | null
  onClose: () => void
  onConfirm: (reason: string) => void
  loading: boolean
}

function ReversarAbonoDialog({
  open,
  pago,
  onClose,
  onConfirm,
  loading,
}: ReversarAbonoDialogProps) {
  const [reason, setReason] = useState('')

  if (!pago) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !loading) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 shrink-0">
              <ArrowCounterClockwise size={18} className="text-destructive" />
            </div>
            <div>
              <DialogTitle>Reversar abono</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatUsd(parseFloat(pago.monto_usd))} — {pago.metodo_nombre}
              </p>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Razon del reverso <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Error en el monto registrado, pago duplicado..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              disabled={loading}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={loading || !reason.trim()}
              onClick={() => { onConfirm(reason); setReason('') }}
            >
              {loading ? 'Reversando...' : 'Confirmar reverso'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Helpers ──────────────────────────────────────────────────

function getDiasRestantes(fechaVenc: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const venc = new Date(fechaVenc + 'T00:00:00')
  return Math.floor((venc.getTime() - today.getTime()) / 86400000)
}

function VencimientoStatusBadge({ v }: { v: VencimientoVenta }) {
  const dias = getDiasRestantes(v.fecha_vencimiento)
  const isPagado = v.status === 'PAGADO'
  const isVencido = dias < 0 && v.status === 'PENDIENTE'
  const isProximo = dias >= 0 && dias <= 7 && v.status === 'PENDIENTE'

  if (isPagado) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
        <CheckCircle size={9} weight="fill" /> Pagado
      </span>
    )
  }
  if (isVencido) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
        <Warning size={9} weight="fill" /> Vencido
      </span>
    )
  }
  if (isProximo) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
        <Clock size={9} weight="fill" /> Proximo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
      Pendiente
    </span>
  )
}

// ─── Props ────────────────────────────────────────────────────

interface FacturaDetalleCxcProps {
  isOpen: boolean
  onClose: () => void
  factura: VentaPendiente | null
}

// ─── Componente principal ─────────────────────────────────────

export function FacturaDetalleCxc({ isOpen, onClose, factura }: FacturaDetalleCxcProps) {
  const { user } = useCurrentUser()
  const { hasPermission } = usePermissions()

  const { detalle, isLoading: loadingDetalle } = useDetalleFactura(factura?.id ?? null)
  const { pagos, isLoading: loadingPagos } = usePagosFactura(factura?.id ?? null)
  const { cargos: cargosEspeciales } = useCargosEspecialesVenta(factura?.id ?? null)
  const { vencimientos } = useVencimientosVenta(factura?.id ?? null)

  const avances = cargosEspeciales.filter((c) => c.tipo === 'AVANCE')
  const prestamoCargos = cargosEspeciales.filter((c) => c.tipo === 'PRESTAMO')
  const tieneOperacionesFinancieras = avances.length > 0 || vencimientos.length > 0

  // Datos extra de la venta (status, procesado_por, cliente)
  const { data: extraData } = useQuery(
    factura
      ? `SELECT v.status, u.nombre as procesado_por_nombre,
               c.nombre as cliente_nombre, c.identificacion as cliente_identificacion
         FROM ventas v
         LEFT JOIN usuarios u ON v.procesado_por = u.id
         LEFT JOIN clientes c ON v.cliente_id = c.id
         WHERE v.id = ?`
      : '',
    factura ? [factura.id] : []
  )
  const extra = (extraData as VentaExtraRow[])?.[0]

  // Reverso state
  const [pagoAReverse, setPagoAReverse] = useState<PagoFacturaCxc | null>(null)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [showReasonDialog, setShowReasonDialog] = useState(false)
  const [supervisorId, setSupervisorId] = useState<string | null>(null)
  const [reversing, setReversing] = useState(false)
  const [pagoOpen, setPagoOpen] = useState(false)

  if (!factura) return null

  const totalUsd = parseFloat(factura.total_usd)
  const totalBs = parseFloat(factura.total_bs)
  const saldoPend = parseFloat(factura.saldo_pend_usd)
  const totalAbonado = totalUsd - saldoPend

  const totalPagado = pagos
    .filter((p) => !p.is_reversed)
    .reduce((sum, p) => sum + parseFloat(p.monto_usd), 0)

  const esAnulada = extra?.status === 'ANULADA' || extra?.status === 'REVERSADA'

  // ─── Flujo de reverso ────────────────────────────────────

  function handleReversar(pago: PagoFacturaCxc) {
    setPagoAReverse(pago)
    if (hasPermission(PERMISSIONS.CXC_REVERSE)) {
      setSupervisorId(user!.id)
      setShowReasonDialog(true)
    } else {
      setShowPinDialog(true)
    }
  }

  function handlePinAuthorized(supId: string) {
    setSupervisorId(supId)
    setShowPinDialog(false)
    setShowReasonDialog(true)
  }

  async function handleConfirmReverso(reason: string) {
    if (!pagoAReverse || !supervisorId || !user) return
    setReversing(true)
    try {
      const reversedByNombre = hasPermission(PERMISSIONS.CXC_REVERSE)
        ? user.nombre
        : 'Supervisor'
      await registrarReversoAbono({
        pago_id: pagoAReverse.id,
        reason,
        reversed_by: supervisorId,
        reversed_by_nombre: reversedByNombre,
        empresa_id: user.empresa_id!,
      })
      toast.success(`Abono de ${formatUsd(parseFloat(pagoAReverse.monto_usd))} reversado exitosamente`)
      setShowReasonDialog(false)
      setPagoAReverse(null)
      setSupervisorId(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al reversar el abono')
    } finally {
      setReversing(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Detalle de Venta</DialogTitle>
              <Badge
                variant="outline"
                className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
              >
                VENTA
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-4">

            {/* ── Encabezado del documento ─────────────────── */}
            <div className="rounded-lg bg-muted/40 border border-border p-4 space-y-3">
              {/* Cliente */}
              {extra?.cliente_nombre && (
                <div>
                  <div className="text-base font-semibold text-foreground">
                    {extra.cliente_nombre}
                  </div>
                  {extra.cliente_identificacion && (
                    <div className="text-xs text-muted-foreground font-mono">
                      {extra.cliente_identificacion}
                    </div>
                  )}
                </div>
              )}

              {/* Datos del documento */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div className="text-muted-foreground">Nro. Factura</div>
                <div className="font-mono font-medium">#{factura.nro_factura}</div>

                <div className="text-muted-foreground">Fecha</div>
                <div>{formatDate(factura.fecha)}</div>

                <div className="text-muted-foreground">Tipo pago</div>
                <div>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      factura.tipo === 'CREDITO'
                        ? 'bg-orange-50 text-orange-700 border-orange-200'
                        : 'bg-green-50 text-green-700 border-green-200'
                    }`}
                  >
                    {factura.tipo}
                  </Badge>
                </div>

                <div className="text-muted-foreground">Tasa Factura</div>
                <div className="font-mono tabular-nums">
                  {parseFloat(factura.tasa).toFixed(4)} Bs/USD
                </div>

                <div className="text-muted-foreground">Status</div>
                <div>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      esAnulada
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-green-50 text-green-700 border-green-200'
                    }`}
                  >
                    {extra?.status ?? 'PROCESADA'}
                  </Badge>
                </div>

                <div className="text-muted-foreground">Procesado por</div>
                <div className="text-muted-foreground">
                  {extra?.procesado_por_nombre ?? '—'}
                </div>
              </div>
            </div>

            {/* ── Articulos vendidos ───────────────────────── */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Articulos Vendidos
              </h4>
              {loadingDetalle ? (
                <div className="h-24 bg-muted/50 rounded animate-pulse" />
              ) : detalle.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Sin detalle disponible</p>
              ) : (
                <div className="overflow-auto rounded-md border max-h-40">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                          Producto
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                          Cant.
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                          P.Unit USD
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {detalle.map((d) => {
                        const cant = parseFloat(d.cantidad)
                        const precio = parseFloat(d.precio_unitario_usd)
                        const subt = parseFloat(d.subtotal_usd)
                        return (
                          <tr key={d.id}>
                            <td className="px-3 py-1.5">
                              <span className="font-mono text-muted-foreground text-[10px]">
                                {d.producto_codigo}
                              </span>
                              {' '}
                              <span>{d.producto_nombre}</span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {cant % 1 === 0 ? cant.toFixed(0) : cant.toFixed(3)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {formatUsd(precio)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                              {formatUsd(subt)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Operaciones financieras (avance / prestamo) ─ */}
            {tieneOperacionesFinancieras && (
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Operaciones Financieras
                </h4>

                {/* AVANCES */}
                {avances.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Wallet size={11} className="text-amber-600" />
                      <span className="text-xs font-medium text-amber-700">Avances de Efectivo</span>
                    </div>
                    <div className="rounded-md border border-amber-200/60 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-amber-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-amber-800">Concepto</th>
                            <th className="text-right px-3 py-2 font-medium text-amber-800">Entregado</th>
                            <th className="text-center px-3 py-2 font-medium text-amber-800">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {avances.map((c) => (
                            <tr key={c.id}>
                              <td className="px-3 py-1.5 text-muted-foreground">{c.concepto}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                                {formatUsd(parseFloat(c.monto))}
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                                  <CheckCircle size={9} weight="fill" />
                                  Cobrado en factura
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* PRESTAMOS */}
                {(prestamoCargos.length > 0 || vencimientos.length > 0) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Handshake size={11} className="text-purple-600" />
                      <span className="text-xs font-medium text-purple-700">Prestamos</span>
                    </div>

                    {/* Concepto y principal de cada movimiento de prestamo */}
                    {prestamoCargos.length > 0 && (
                      <div className="rounded-t-md border border-purple-200/60 bg-purple-50/60 px-3 py-2 space-y-0.5">
                        {prestamoCargos.map((c) => (
                          <p key={c.id} className="text-xs text-purple-900">
                            <span className="font-medium">Principal entregado:</span>{' '}
                            {formatUsd(parseFloat(c.monto))}
                            {c.concepto && (
                              <span className="text-purple-600 ml-1">— {c.concepto}</span>
                            )}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Estado del vencimiento desde vencimientos_cobrar */}
                    {vencimientos.length > 0 && (
                      <div className={`border border-purple-200/60 overflow-hidden ${prestamoCargos.length > 0 ? 'border-t-0 rounded-b-md' : 'rounded-md'}`}>
                        <table className="w-full text-xs">
                          <thead className="bg-purple-50/50">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-purple-800">Estado</th>
                              <th className="text-right px-3 py-2 font-medium text-purple-800">Total c/interes</th>
                              <th className="text-right px-3 py-2 font-medium text-purple-800">Pagado</th>
                              <th className="text-right px-3 py-2 font-medium text-purple-800">Saldo</th>
                              <th className="text-left px-3 py-2 font-medium text-purple-800">Vence</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-purple-100">
                            {vencimientos.map((v) => {
                              const saldo = parseFloat(v.saldo_pendiente_usd)
                              return (
                                <tr key={v.id}>
                                  <td className="px-3 py-2">
                                    <VencimientoStatusBadge v={v} />
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatUsd(parseFloat(v.monto_original_usd))}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-green-600">
                                    {formatUsd(parseFloat(v.monto_pagado_usd))}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-destructive">
                                    {saldo > 0.005 ? formatUsd(saldo) : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                    {formatDate(v.fecha_vencimiento)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Totales ──────────────────────────────────── */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Factura:</span>
                <span className="font-bold text-foreground">{formatUsd(totalUsd)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Bs:</span>
                <span className="font-medium text-muted-foreground">{formatBs(totalBs)}</span>
              </div>
              {totalAbonado > 0.005 && (
                <div className="flex justify-between text-sm border-t border-border/50 pt-1.5">
                  <span className="text-muted-foreground">Abonado:</span>
                  <span className="font-medium text-green-600">{formatUsd(totalAbonado)}</span>
                </div>
              )}
              {saldoPend > 0.005 ? (
                <div className="flex justify-between text-sm border-t border-border pt-1.5">
                  <span className="font-medium text-muted-foreground">Saldo Pendiente:</span>
                  <span className="font-bold text-destructive">{formatUsd(saldoPend)}</span>
                </div>
              ) : totalAbonado > 0.005 ? (
                <div className="text-center text-xs text-green-600 font-medium pt-1.5 border-t border-border">
                  Factura completamente pagada
                </div>
              ) : null}
            </div>

            {/* ── Historial de pagos ───────────────────────── */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Historial de Pagos
              </h4>
              {loadingPagos ? (
                <div className="h-16 bg-muted/50 rounded animate-pulse" />
              ) : pagos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Sin pagos registrados</p>
              ) : (
                <div className="overflow-auto rounded-md border max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Metodo</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ref.</th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">Monto</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground">Accion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pagos.map((p) => {
                        const montoUsdVal = parseFloat(p.monto_usd)
                        const montoOrig = parseFloat(p.monto)
                        const isReversed = p.is_reversed === 1
                        return (
                          <tr
                            key={p.id}
                            className={isReversed ? 'opacity-40' : ''}
                          >
                            <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                              {p.fecha?.slice(0, 10)}
                            </td>
                            <td className={`px-3 py-1.5 ${isReversed ? 'line-through text-muted-foreground' : ''}`}>
                              {p.metodo_nombre}
                              {p.moneda_label === 'BS' && (
                                <div className="text-[10px] text-muted-foreground leading-tight">
                                  {formatBs(montoOrig)} @ {parseFloat(p.tasa).toFixed(2)}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground">
                              {p.referencia || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span className={`font-medium tabular-nums ${isReversed ? 'line-through text-muted-foreground' : 'text-green-600'}`}>
                                {formatUsd(montoUsdVal)}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {isReversed ? (
                                <span className="text-[10px] text-muted-foreground italic">Reversado</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleReversar(p)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors"
                                >
                                  <ArrowCounterClockwise className="h-2.5 w-2.5" />
                                  Reversar
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {totalPagado > 0.005 && (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/20">
                          <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Total pagado
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-green-600 tabular-nums">
                            {formatUsd(totalPagado)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* ── Footer ───────────────────────────────────── */}
            <div className="flex justify-between items-center pt-3 border-t border-border">
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              {!esAnulada && (saldoPend > 0.01 || vencimientos.some((v) => parseFloat(v.saldo_pendiente_usd) > 0.01)) && (
                <Button onClick={() => setPagoOpen(true)}>
                  Registrar Pago
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-modal de pago */}
      <PagoFacturaModal
        isOpen={pagoOpen}
        onClose={() => setPagoOpen(false)}
        factura={factura}
        clienteId={factura.cliente_id}
        clienteNombre={extra?.cliente_nombre ?? undefined}
        onSuccess={() => setPagoOpen(false)}
        vencimientos={vencimientos}
      />

      {/* PIN supervisor */}
      <SupervisorPinDialog
        isOpen={showPinDialog}
        onClose={() => { setShowPinDialog(false); setPagoAReverse(null) }}
        onAuthorized={handlePinAuthorized}
        titulo="Autorizacion requerida"
        mensaje="Ingresa el PIN de supervisor para reversar este abono."
        requiredPermission={PERMISSIONS.CXC_REVERSE}
      />

      {/* Motivo del reverso */}
      <ReversarAbonoDialog
        open={showReasonDialog}
        pago={pagoAReverse}
        onClose={() => {
          if (!reversing) {
            setShowReasonDialog(false)
            setPagoAReverse(null)
            setSupervisorId(null)
          }
        }}
        onConfirm={handleConfirmReverso}
        loading={reversing}
      />
    </>
  )
}
